import sharp from "sharp";
import request from "supertest";
import { inkFor, STATUS_BAR, topColor, withStatusBar } from "../src/statusbar";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { card, openGraph } from "../src/card";
import { publicAddress, publicFetch, publicUrl, tracker, withScheme } from "../src/capture";
import { checkLink, STANDARD, readTags, type Fetcher } from "../src/check";
import { allowedHost, type Domain } from "../src/domains";
import { imageFixes, type Capturer } from "../src/preview";
import { GenerateError } from "../src/shared";
import { fileStem } from "../src/screenshot";

const abtech: Domain = {
  domain: "abtech.org",
  group: "AB Tech",
  added: "2026-11-14",
  request: "https://github.com/cmu-web/cmu-web-fencepost/issues/1",
};

// A made-up page: a tall red PNG, as a browser screenshot would be
const screenshot = () =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: "#c41230" } })
    .png()
    .toBuffer();

// Captures nothing; checks the domain rule the way the real capture does
const fakeCapture: Capturer = async (url, allow) => {
  if (!allow(new URL(url).hostname)) throw new Error("not allowed");
  return { image: await screenshot(), title: "Andrew Carnegie's Page", description: "Made up." };
};

describe("which sites FencePost captures", () => {
  it("allows cmu.edu and its subdomains, and listed domains with their www", () => {
    for (const host of ["cmu.edu", "www.cmu.edu", "webkilt.andrew.cmu.edu", "CMU.EDU."])
      expect(allowedHost(host, [])).toBe(true);
    expect(allowedHost("abtech.org", [abtech])).toBe(true);
    expect(allowedHost("www.abtech.org", [abtech])).toBe(true);
  });

  it("refuses look-alikes and unlisted subdomains", () => {
    for (const host of ["notcmu.edu", "cmu.edu.example.com", "cmu.edu-x.com", "example.com"])
      expect(allowedHost(host, [abtech])).toBe(false);
    expect(allowedHost("shop.abtech.org", [abtech])).toBe(false);
    expect(allowedHost("shop.abtech.org", [{ ...abtech, subdomains: true }])).toBe(true);
  });

  it("refuses credentials and other schemes, but takes any port", () => {
    expect(() => publicUrl("ftp://www.cmu.edu/")).toThrow(/web pages/);
    expect(() => publicUrl("https://ac00:secret@www.cmu.edu/")).toThrow(/username and password/);
    expect(() => publicUrl("not a url")).toThrow(/link/);
    expect(publicUrl("https://www.cmu.edu/").hostname).toBe("www.cmu.edu");
    expect(publicUrl("https://www.cmu.edu:8443/").port).toBe("8443");
    expect(withScheme("www.cmu.edu:8443/example/")).toBe("https://www.cmu.edu:8443/example/");
    expect(withScheme("http://www.cmu.edu/")).toBe("http://www.cmu.edu/");
  });

  it("treats only ordinary internet addresses as public", () => {
    for (const a of ["10.0.0.1", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.1.1", "::1"])
      expect(publicAddress(a)).toBe(false);
    expect(publicAddress("128.2.42.10")).toBe(true);
  });

  it("skips analytics and ad hosts, so a preview isn't counted as a visit", () => {
    expect(tracker("https://www.googletagmanager.com/gtm.js?id=GTM-X")).toBe(true);
    expect(tracker("https://ad.doubleclick.net/ccm/s/collect")).toBe(true);
    expect(tracker("https://www.cmu.edu/common/standard-v6/css/main.6.7.min.css")).toBe(false);
  });

  it("refuses a disallowed page before looking anything up", async () => {
    await expect(publicFetch("https://example.com/", () => false)).rejects.toThrow(
      /Carnegie Mellon sites/,
    );
  });
});

describe("the preview", () => {
  it("is a 1200 × 630 JPEG under 300 KB", async () => {
    const image = await card(await screenshot());
    expect(image.length).toBeLessThanOrEqual(300_000);
    expect(await sharp(image).metadata()).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 630,
    });
  });

  it("writes escaped Open Graph tags for the image on the page's own site", () => {
    const tags = openGraph({
      url: "https://www.cmu.edu/example/",
      title: 'Andrew "AC" Carnegie',
      description: "Made up <b>here</b>.",
      site: "Example",
      imagePath: "images/preview.jpg",
    });
    expect(tags).toContain(
      '<meta property="og:image" content="https://www.cmu.edu/example/images/preview.jpg" />',
    );
    expect(tags).toContain("Andrew &quot;AC&quot; Carnegie");
    expect(tags).toContain("&lt;b>");
    expect(tags).toContain('content="A screenshot of Andrew &quot;AC&quot; Carnegie."');
    expect(tags).toContain('name="twitter:card" content="summary_large_image"');
    expect(tags).not.toContain("—");
  });

  it("keeps apostrophes and names the page in the alt text", () => {
    const tags = openGraph({
      url: "https://www.cmu.edu/example/",
      title: "Andrew Carnegie's Page - Made Up - Carnegie Mellon University",
      description: "CMU's made-up page.",
      site: "Made Up",
      imagePath: "/images/preview.jpg",
    });
    expect(tags).toContain("CMU's made-up page.");
    expect(tags).toContain('content="A screenshot of Andrew Carnegie\'s Page."');
  });
});

describe("an image link", () => {
  const image = (w: number, h: number, format: "jpeg" | "png") => {
    const base = sharp({ create: { width: w, height: h, channels: 3, background: "#c41230" } });
    return (format === "jpeg" ? base.jpeg() : base.png()).toBuffer();
  };
  it("passes a 1200 x 630 JPEG under 300 KB as it is", async () => {
    expect(await imageFixes(await image(1200, 630, "jpeg"))).toEqual([]);
  });
  it("says what's off with any other image", async () => {
    const fixes = await imageFixes(await image(2400, 1260, "png"));
    expect(fixes).toHaveLength(2);
    expect(fixes[0]).toContain("2400 × 1260");
    expect(fixes[1]).toContain("PNG");
  });
});

describe("the API", () => {
  const app = createApp([abtech], fakeCapture);

  it("captures an allowed page and returns the image and tags", async () => {
    const res = await request(app)
      .post("/api/preview")
      .send({ url: "https://www.cmu.edu/example/", site: "Example" })
      .expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.title).toBe("Andrew Carnegie's Page");
    expect(res.body.tags).toContain('property="og:site_name" content="Example"');
    const image = Buffer.from(res.body.image, "base64");
    expect(await sharp(image).metadata()).toMatchObject({ width: 1200, height: 630 });
  });

  it("uses an uploaded screenshot without capturing", async () => {
    const res = await request(app)
      .post("/api/preview")
      .send({
        url: "https://example.com/",
        title: "Made Up",
        screenshot: (await screenshot()).toString("base64"),
      })
      .expect(200);
    expect(res.body.title).toBe("Made Up");
  });

  it("adds https:// to an address typed without it", async () => {
    const res = await request(app)
      .post("/api/preview")
      .send({ url: "www.cmu.edu/example/" })
      .expect(200);
    expect(res.body.tags).toContain("https://www.cmu.edu/example/");
  });

  it("says what's wrong in plain words", async () => {
    const missing = await request(app).post("/api/preview").send({}).expect(400);
    expect(missing.body.error).toMatch(/link/);
    const noTitle = await request(app)
      .post("/api/preview")
      .send({ url: "https://www.cmu.edu/", screenshot: "aGk=" })
      .expect(400);
    expect(noTitle.body.error).toMatch(/title/);
  });

  it("names screenshot files for the page's site and path", () => {
    expect(fileStem("https://www.cmu.edu/", "phone")).toBe("cmu-edu-phone");
    expect(fileStem("https://www.cmu.edu/teaching/", "card")).toBe("cmu-edu-teaching-card");
    expect(fileStem("https://webkilt.andrew.cmu.edu/0/index.html", "card")).toBe(
      "webkilt-andrew-cmu-edu-0-index-card",
    );
    expect(fileStem("https://www.cmu.edu/" + "a".repeat(100), "phone").length).toBeLessThanOrEqual(
      66,
    );
    expect(fileStem("not a url", "phone")).toBe("page-phone");
  });

  it("makes a card and a phone screenshot at their exact sizes", async () => {
    const card = await request(app)
      .post("/api/screenshot")
      .send({ url: "https://www.cmu.edu/example/", kind: "card" })
      .expect(200);
    expect(card.body).toMatchObject({ width: 1040, height: 656 });
    expect(card.body.images[0]).toMatchObject({
      format: "webp",
      file: "cmu-edu-example-card.webp",
    });
    const phone = await request(app)
      .post("/api/screenshot")
      .send({ url: "https://www.cmu.edu/example/", kind: "phone" })
      .expect(200);
    expect(phone.body).toMatchObject({ width: 860, height: 1580 });
    // All three formats, each the real thing at the full size
    const files = phone.body.images as {
      format: string;
      file: string;
      type: string;
      bytes: number;
      image: string;
    }[];
    expect(files.map((f) => f.file)).toEqual([
      "cmu-edu-example-phone.webp",
      "cmu-edu-example-phone.png",
      "cmu-edu-example-phone.jpg",
    ]);
    for (const f of files) {
      const image = Buffer.from(f.image, "base64");
      expect(image.length).toBe(f.bytes);
      expect(await sharp(image).metadata()).toMatchObject({
        format: f.format,
        width: 860,
        height: 1580,
      });
    }
  });

  it("refuses a screenshot of a site it doesn't capture", async () => {
    const res = await request(app)
      .post("/api/screenshot")
      .send({ url: "https://example.com/", kind: "phone" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const bad = await request(app)
      .post("/api/screenshot")
      .send({ url: "https://www.cmu.edu/", kind: "poster" })
      .expect(400);
    expect(bad.body.error).toMatch(/card or a phone/);
  });

  it("answers health checks and serves MCP over POST only", async () => {
    await request(app).get("/healthz").expect(200, "ok\n");
    await request(app).get("/mcp").expect(405);
  });
});

describe("the link checker", () => {
  const jpeg = (w: number, h: number) =>
    sharp({ create: { width: w, height: h, channels: 3, background: "#c41230" } })
      .jpeg()
      .toBuffer();
  // Serves made-up pages and images, the way publicFetch would
  const site =
    (pages: Record<string, string>, images: Record<string, Promise<Buffer>>): Fetcher =>
    async (url, allow) => {
      const u = new URL(url);
      if (allow && !allow(u.hostname))
        throw new GenerateError("FencePost works only with Carnegie Mellon sites.", 403);
      if (pages[u.href])
        return { body: Buffer.from(pages[u.href]), type: "text/html", url: u.href };
      if (images[u.href]) return { body: await images[u.href], type: "image/jpeg", url: u.href };
      throw new Error("not found");
    };
  const good = `<!doctype html><html><head><title>Example - Made Up</title>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Made Up">
    <meta property="og:title" content="Example &amp; More - Made Up">
    <meta property="og:description" content="A made-up page for Andrew Carnegie.">
    <meta property="og:url" content="https://www.cmu.edu/made-up/">
    <meta property="og:image" content="https://www.cmu.edu/made-up/images/preview.jpg">
    <meta property="og:image:alt" content="Made Up's home page.">
    <meta name="twitter:card" content="summary_large_image"></head><body></body></html>`;
  const bad = `<!doctype html><html><head><title>Bare</title>
    <meta property="og:title" content="Bare">
    <meta property="og:title" content="Bare Again">
    <meta property="og:image" content="/images/big.jpg"></head></html>`;
  // A news story with no date or author, and a page in /news/ that isn't
  // marked as an article
  const story = good
    .replace('content="website"', 'content="article"')
    .replace("https://www.cmu.edu/made-up/", "https://www.cmu.edu/news/story/");
  const unmarked = good.replace("https://www.cmu.edu/made-up/", "https://www.cmu.edu/news/other/");
  const fetcher = site(
    {
      "https://www.cmu.edu/made-up/": good,
      "https://www.cmu.edu/bare/": bad,
      "https://www.cmu.edu/news/story/": story,
      "https://www.cmu.edu/news/other/": unmarked,
    },
    {
      "https://www.cmu.edu/made-up/images/preview.jpg": jpeg(1200, 630),
      "https://www.cmu.edu/images/big.jpg": jpeg(900, 600),
    },
  );
  const allow = (h: string) => allowedHost(h, []);

  it("passes a page that follows the standard", async () => {
    const r = await checkLink("https://www.cmu.edu/made-up/", allow, fetcher);
    expect(r.findings.filter((f) => f.status !== "pass")).toEqual([]);
    expect(r.title).toBe("Example & More - Made Up");
    expect(r.image).toMatchObject({ width: 1200, height: 630, format: "jpeg" });
  });

  it("checks an article's type, date and author when asked, and only then", async () => {
    // The page says it's an article: missing date and author are notes
    const marked = await checkLink("https://www.cmu.edu/news/story/", allow, fetcher);
    const notes = marked.findings.filter((f) => f.status === "note");
    expect(notes.map((f) => f.tag)).toEqual(["article:published_time", "article:author"]);
    expect(notes[0].standard?.url).toMatch(/#articles$/);
    // The person says it's an article: everything missing is a fix
    const asked = await checkLink("https://www.cmu.edu/news/other/", allow, fetcher, true);
    const fixes = asked.findings.filter((f) => f.status === "fix").map((f) => f.tag);
    expect(fixes).toEqual(["og:type", "article:published_time", "article:author"]);
    // Neither: no article checks, even with news in the address
    const page = await checkLink("https://www.cmu.edu/news/other/", allow, fetcher);
    expect(page.findings.some((f) => f.key.startsWith("article"))).toBe(false);
  });

  it("says what to fix on a page that doesn't", async () => {
    const r = await checkLink("https://www.cmu.edu/bare/", allow, fetcher);
    const fixes = r.findings.filter((f) => f.status === "fix").map((f) => f.key);
    expect(fixes).toEqual(
      expect.arrayContaining([
        "og:title-twice",
        "description",
        "site",
        "url",
        "image-address",
        "image-size",
        "alt",
        "card",
      ]),
    );
    expect(r.findings.find((f) => f.key === "image-size")?.text).toContain("900 × 600");
  });

  it("links each fix to its section of the standard, and no pass", async () => {
    const r = await checkLink("https://www.cmu.edu/bare/", allow, fetcher);
    const link = (key: string) => r.findings.find((f) => f.key === key)?.standard;
    expect(link("alt")).toEqual({ title: "Make a Preview Image", url: `${STANDARD}#image` });
    expect(link("card")).toEqual({ title: "Open Graph Tags", url: `${STANDARD}#tags` });
    expect(r.findings.filter((f) => f.status === "pass").every((f) => !f.standard)).toBe(true);
  });

  it("reads tags written either way, with entities", () => {
    const { tags, title } = readTags(
      `<head><title>A &amp; B</title><meta content='x' name='description'><meta property=og:title content="C &#39;D&#39;"></head>`,
    );
    expect(title).toBe("A & B");
    expect(tags.get("description")).toEqual(["x"]);
    expect(tags.get("og:title")).toEqual(["C 'D'"]);
  });

  it("checks only Carnegie Mellon sites, through the API", async () => {
    const app = createApp([], fakeCapture, fetcher);
    const ok = await request(app)
      .post("/api/check")
      .send({ url: "https://www.cmu.edu/made-up/" })
      .expect(200);
    expect(ok.body.siteName).toBe("Made Up");
    const refused = await request(app)
      .post("/api/check")
      .send({ url: "https://example.com/" })
      .expect(403);
    expect(refused.body.error).toMatch(/Carnegie Mellon sites/);
  });
});

describe("phone status bar", () => {
  it("picks white on the roof's red and gray, near-black on white", () => {
    expect(inkFor([196, 18, 48])).toBe("#fff");
    expect(inkFor([109, 110, 113])).toBe("#fff");
    expect(inkFor([255, 255, 255])).toBe("#1d2125");
  });

  it("takes the top edge's most common color, not an average", async () => {
    // A red roof with a black block at the right, as on some sites
    const page = await sharp({
      create: { width: 780, height: 100, channels: 3, background: { r: 196, g: 18, b: 48 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 300, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
          })
            .png()
            .toBuffer(),
          left: 480,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    expect(await topColor(page)).toEqual([196, 18, 48]);
  });

  it("adds the bar above the page in the page's top color", async () => {
    const page = await sharp({
      create: { width: 780, height: 400, channels: 3, background: { r: 196, g: 18, b: 48 } },
    })
      .png()
      .toBuffer();
    const out = await withStatusBar(page, 2);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([780, 400 + STATUS_BAR * 2]);
    expect(await topColor(out)).toEqual([196, 18, 48]);
  });
});
