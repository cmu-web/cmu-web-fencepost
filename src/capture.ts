import { Resolver } from "node:dns/promises";
import http, { STATUS_CODES } from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { chromium } from "playwright";
import { GenerateError } from "./shared";

// Public resolvers, not the server's own: names that exist only in CMU's
// internal DNS don't resolve, so FencePost sees what the public sees
const resolver = new Resolver({ timeout: 5000, tries: 2 });
resolver.setServers((process.env.DNS_SERVERS || "1.1.1.1,8.8.8.8").split(","));

const USER_AGENT = "FencePost/1.0 (link preview; https://fencepost.andrew.cmu.edu/)";

/** An address as typed: www.cmu.edu/example/ and www.cmu.edu:8443/ get
 *  https:// in front; only a scheme followed by // counts as one */
export function withScheme(input: string): string {
  const trimmed = input.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/\//, "")}`;
}

// Any port: CMU sites run on all sorts of them. The address still has to
// resolve to a public IP (resolvePublic), so a port doesn't reach anything
// private.
// A failed connection, in plain words
function networkMessage(e: NodeJS.ErrnoException): string {
  const code = e.code || "";
  if (/CERT|SSL|TLS|SELF_SIGNED|ALTNAME/.test(code))
    return "This site's security certificate doesn't match the link, so FencePost can't safely load it.";
  if (code === "ECONNREFUSED")
    return "FencePost couldn't connect to that site. Check the link, or try again later.";
  if (code === "ECONNRESET" || code === "EPIPE")
    return "The site stopped responding partway through. Try again.";
  if (code === "ETIMEDOUT") return "The site took too long to respond.";
  return "FencePost couldn't reach the site.";
}

export function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new GenerateError("Enter a link to a page, such as www.cmu.edu/example/.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new GenerateError("FencePost works only with web pages, such as www.cmu.edu/example/.");
  if (url.username || url.password)
    throw new GenerateError("Leave the username and password out of the address.");
  return url;
}

// Only ordinary internet addresses: no private, loopback, link-local or
// other special ranges
export function publicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

type Resolved = { address: string; family: 4 | 6 };

// Lookups for five minutes, shared while in progress: a page loads dozens of
// files from a few hosts, and each would otherwise be its own query
const LOOKUP_MS = 5 * 60_000;
const lookups = new Map<string, { at: number; result: Promise<Resolved> }>();

async function lookUp(h: string): Promise<Resolved> {
  const [v4, v6] = await Promise.all([
    resolver.resolve4(h).catch((e: NodeJS.ErrnoException) => e),
    resolver.resolve6(h).catch((e: NodeJS.ErrnoException) => e),
  ]);
  const found = (r: string[] | NodeJS.ErrnoException) => (Array.isArray(r) ? r : []);
  const all = [...found(v4), ...found(v6)];
  if (!all.length) {
    // No such name, or the lookup itself failed
    const missing = [v4, v6].every(
      (r) => !Array.isArray(r) && ["ENOTFOUND", "ENODATA"].includes(r.code || ""),
    );
    throw new GenerateError(
      missing
        ? "That address isn't on the public internet."
        : "FencePost couldn't look up that address. Try again shortly.",
      missing ? 400 : 503,
    );
  }
  if (all.some((a) => !publicAddress(a)))
    throw new GenerateError("That address isn't on the public internet.");
  return found(v4).length
    ? { address: found(v4)[0], family: 4 }
    : { address: found(v6)[0], family: 6 };
}

export async function resolvePublic(host: string): Promise<Resolved> {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (ipaddr.isValid(h)) {
    if (!publicAddress(h)) throw new GenerateError("Use a public website address.");
    return { address: h, family: ipaddr.parse(h).kind() === "ipv6" ? 6 : 4 };
  }
  const cached = lookups.get(h);
  if (cached && Date.now() - cached.at < LOOKUP_MS) return cached.result;
  const result = lookUp(h);
  lookups.set(h, { at: Date.now(), result });
  // Failures aren't kept, so the next request tries again
  result.catch(() => lookups.delete(h));
  return result;
}

export interface Fetched {
  body: Buffer;
  type: string;
  url: string;
}

// Fetches over the address it checked, so a second lookup can't switch to a
// private one. allow, when given, has to pass for the address and for each
// redirect.
export async function publicFetch(
  input: string,
  allow?: (host: string) => boolean,
  redirects = 0,
  // The page asking for it, passed on as the browser would: some embeds, such
  // as YouTube's player, refuse to play without it
  referer?: string,
): Promise<Fetched> {
  const url = publicUrl(input);
  if (allow && !allow(url.hostname))
    throw new GenerateError(
      "FencePost works only with Carnegie Mellon sites. To add yours, use the Request a Domain form on the Reference page.",
      403,
    );
  const address = await resolvePublic(url.hostname);
  const result = await new Promise<{
    body: Buffer;
    type: string;
    location?: string;
    status: number;
    server?: string;
    mitigated?: string;
  }>((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        agent: false,
        family: address.family,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Encoding": "identity",
          ...(referer ? { Referer: referer } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
          if (length > 8 * 1024 * 1024)
            req.destroy(new GenerateError("Part of that page is over the 8 MB limit."));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            body: Buffer.concat(chunks),
            type: res.headers["content-type"] || "application/octet-stream",
            location: res.headers.location,
            status: res.statusCode || 502,
            server: String(res.headers.server || ""),
            mitigated: String(res.headers["cf-mitigated"] || ""),
          }),
        );
      },
    );
    req.setTimeout(8000, () =>
      req.destroy(new GenerateError("The site took too long to respond.", 504)),
    );
    const deadline = setTimeout(
      () => req.destroy(new GenerateError("The site took too long to respond.", 504)),
      10000,
    );
    req.on("close", () => clearTimeout(deadline));
    req.on("error", (e: NodeJS.ErrnoException) =>
      reject(e instanceof GenerateError ? e : new GenerateError(networkMessage(e), 502)),
    );
  });
  if (result.status >= 300 && result.status < 400 && result.location) {
    if (redirects >= 5) throw new GenerateError("The site redirects too many times.");
    return publicFetch(new URL(result.location, url).href, allow, redirects + 1, referer);
  }
  // Cloudflare's bot check answers a non-browser with a challenge page, not
  // the site: say so, rather than blame a sign-in
  if (
    (result.status === 403 || result.status === 503) &&
    /cloudflare/i.test(result.server || "") &&
    (result.mitigated === "challenge" ||
      /cf-chl|challenge-platform|Just a moment/i.test(result.body.toString("utf8")))
  )
    throw new GenerateError(
      "This site uses Cloudflare to block automated visitors. FencePost can't see the page. Whoever manages the site's Cloudflare settings can let FencePost through; the Reference page says how.",
      502,
      "bot-check",
    );
  if (result.status >= 400) {
    const answer = `The address returned ${result.status} ${STATUS_CODES[result.status] || "Error"}.`;
    throw new GenerateError(
      result.status === 401 || result.status === 403
        ? `${answer} It may need a sign-in, which FencePost doesn't use.`
        : answer,
      502,
    );
  }
  return { body: result.body, type: result.type, url: url.href };
}

// Analytics and ad hosts aren't loaded, so a preview doesn't count as a visit
// in the site's own statistics
const TRACKERS =
  /(^|\.)(google-analytics\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|facebook\.net|hotjar\.com|usersnap\.com|clarity\.ms)$/i;
export const tracker = (url: string) => {
  try {
    return TRACKERS.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

export interface Capture {
  image: Buffer;
  title: string;
  description: string;
  /** Where to crop it to 1200 × 630 from: the top (a page) or the middle */
  position?: "top" | "centre";
}

let active = 0;

/** A link preview's size, and a CMU Web gallery shot's (the size of each
 * project's cmu-web-preview.webp) */
export const PREVIEW_SIZE = { width: 1200, height: 630 };
export const GALLERY_SIZE = { width: 1040, height: 656 };
/** The Web Kilt phone frame's screen (430 × 790, a larger phone's width)
 *  less the status bar, which statusbar.ts adds, so the shot fills the frame
 *  with nothing cut */
export const PHONE_SIZE = { width: 430, height: 738 };

// Screenshots the top of a public page, signed out, at a link preview's size
// unless given another. The browser has no network of its own: every request
// goes through publicFetch.
export async function capturePage(
  input: string,
  allow: (host: string) => boolean,
  size: { width: number; height: number } = PREVIEW_SIZE,
  /** Device pixels per CSS pixel: 2 for a phone's sharper screen */
  scale = 1,
): Promise<Capture> {
  publicUrl(input);
  if (active >= 2)
    throw new GenerateError("Two captures are already in progress. Try again shortly.", 429);
  active++;
  try {
    const page0 = await publicFetch(input, allow);
    const browser = await chromium.launch({
      proxy: { server: "http://127.0.0.1:9" },
      args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"],
    });
    try {
      const context = await browser.newContext({
        viewport: size,
        deviceScaleFactor: scale,
        serviceWorkers: "block",
        acceptDownloads: false,
      });
      await context.routeWebSocket("**/*", (socket) => socket.close());
      let requests = 0;
      const failed: string[] = [];
      await context.route("**/*", async (route) => {
        if (
          ++requests > 80 ||
          route.request().method() !== "GET" ||
          tracker(route.request().url())
        ) {
          await route.abort();
          return;
        }
        const url = route.request().url();
        const referer = route.request().headers()["referer"];
        try {
          // One retry: a dropped connection would leave the page unstyled
          const resource =
            url === page0.url
              ? page0
              : await publicFetch(url, undefined, 0, referer).catch((e: unknown) => {
                  if (e instanceof GenerateError) throw e;
                  return publicFetch(url, undefined, 0, referer);
                });
          await route.fulfill({ status: 200, contentType: resource.type, body: resource.body });
        } catch (e) {
          failed.push(`${url} (${(e as Error).message})`);
          await route.abort();
        }
      });
      const page = await context.newPage();
      const deadline = setTimeout(() => void context.close(), 20000);
      try {
        await page.goto(page0.url, { waitUntil: "load", timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        // The template opens its menu on its own on a wide screen; the
        // standard shows the page with the menu closed
        const menu = page.locator('.menu-btn[aria-pressed="true"]');
        if (await menu.count()) {
          await menu
            .first()
            .click({ timeout: 2000 })
            .catch(() => undefined);
          await page.waitForTimeout(500);
        }
        const title = (await page.title()).slice(0, 100);
        const description = (
          await page
            .locator('meta[name="description"]')
            .evaluateAll((nodes) => nodes[0]?.getAttribute("content") || "")
        ).slice(0, 220);
        if (failed.length) console.warn("capture missed", failed.length, "files:", failed);
        return {
          image: await page.screenshot({ type: "png", animations: "disabled", timeout: 5000 }),
          title,
          description,
        };
      } finally {
        clearTimeout(deadline);
      }
    } finally {
      await browser.close();
    }
  } finally {
    active--;
  }
}
