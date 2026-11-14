import sharp from "sharp";
import { publicFetch, publicUrl, type Fetched } from "./capture";
import { GenerateError } from "./shared";

// One finding: pass, fix (against the Web Kilt's Link Previews standard) or
// a note worth knowing
export interface Finding {
  key: string;
  status: "pass" | "fix" | "note";
  text: string;
}

export interface ImageInfo {
  url: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  error?: string;
}

export interface CheckResult {
  url: string;
  host: string;
  title: string;
  description: string;
  siteName: string;
  image?: ImageInfo;
  imageAlt: string;
  findings: Finding[];
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1))
      : (entities[e.toLowerCase()] ?? m),
  );

// Each <meta property|name> in the page's head, every value it appears with
export function readTags(html: string): { tags: Map<string, string[]>; title: string } {
  const head = html.slice(0, Math.max(html.search(/<\/head>/i), 0) || 512 * 1024);
  const tags = new Map<string, string[]>();
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of m[0].matchAll(/([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi))
      attrs.set(a[1].toLowerCase(), decode(a[3] ?? a[4] ?? a[5] ?? ""));
    const key = (attrs.get("property") || attrs.get("name") || "").toLowerCase();
    if (key && attrs.has("content"))
      tags.set(key, [...(tags.get(key) || []), attrs.get("content")!]);
  }
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] || "").trim());
  return { tags, title };
}

export type Fetcher = typeof publicFetch;

async function imageInfo(url: string, fetcher: Fetcher): Promise<ImageInfo> {
  try {
    const got = await fetcher(url);
    const meta = await sharp(got.body, { limitInputPixels: 50_000_000 }).metadata();
    return {
      url,
      width: meta.width,
      height: meta.height,
      format: meta.format,
      bytes: got.body.length,
    };
  } catch (e) {
    return {
      url,
      error: e instanceof GenerateError ? e.message : "It isn't an image FencePost can read.",
    };
  }
}

// Reads a page's preview tags and its image, and checks them against the
// Web Kilt's Link Previews standard
export async function checkLink(
  input: string,
  allow: (host: string) => boolean,
  fetcher: Fetcher = publicFetch,
): Promise<CheckResult> {
  publicUrl(input);
  const page: Fetched = await fetcher(input, allow);
  if (!/html/i.test(page.type)) throw new GenerateError("That address isn't a web page.");
  const { tags, title: htmlTitle } = readTags(page.body.toString("utf8"));
  const one = (k: string) => tags.get(k)?.[0]?.trim() || "";
  const findings: Finding[] = [];
  const add = (key: string, status: Finding["status"], text: string) =>
    findings.push({ key, status, text });

  for (const k of ["og:title", "og:description", "og:image", "og:url"])
    if ((tags.get(k)?.length || 0) > 1)
      add(
        `${k}-twice`,
        "fix",
        `${k} appears ${tags.get(k)!.length} times. A CMS may already write it; remove the extra copy.`,
      );

  const title = one("og:title");
  if (title) add("title", "pass", `The title is "${title}".`);
  else add("title", "fix", "Add og:title: the page's name, then the site's.");

  const description = one("og:description");
  if (!description)
    add("description", "fix", "Add og:description: one short sentence about the page.");
  else if (description.length > 200)
    add(
      "description",
      "note",
      "The description is long; apps may cut it off after about 200 characters.",
    );
  else add("description", "pass", "The description is one short sentence.");

  const siteName = one("og:site_name");
  if (siteName) add("site", "pass", `The site's name is "${siteName}".`);
  else add("site", "fix", "Add og:site_name with the site's name.");

  const ogUrl = one("og:url");
  if (!ogUrl) add("url", "fix", "Add og:url with the page's full https:// address.");
  else if (!/^https:\/\//i.test(ogUrl)) add("url", "fix", "Give og:url a full https:// address.");
  else if (ogUrl.replace(/\/$/, "") !== page.url.replace(/\/$/, ""))
    add("url", "note", `og:url points to ${ogUrl}, not to this address.`);
  else add("url", "pass", "og:url is this page's full address.");

  let image: ImageInfo | undefined;
  const rawImage = one("og:image");
  if (!rawImage) add("image", "fix", "Add og:image: the site's preview image, 1200 by 630.");
  else {
    if (!/^https:\/\//i.test(rawImage))
      add("image-address", "fix", "Give og:image a full https:// address, not a path.");
    image = await imageInfo(new URL(rawImage, page.url).href, fetcher);
    if (image.error) add("image", "fix", `The image didn't load: ${image.error}`);
    else {
      if (image.width === 1200 && image.height === 630)
        add("image-size", "pass", "The image is 1200 by 630.");
      else
        add(
          "image-size",
          "fix",
          `Make the image 1200 by 630; it's ${image.width} by ${image.height}.`,
        );
      if (image.bytes! > 300_000)
        add(
          "image-bytes",
          "fix",
          `Make the image smaller than 300 KB; it's ${Math.round(image.bytes! / 1000)} KB.`,
        );
      else add("image-bytes", "pass", `The image is ${Math.round(image.bytes! / 1000)} KB.`);
      if (image.format !== "jpeg")
        add(
          "image-type",
          "note",
          `The image is a ${image.format?.toUpperCase()}; the standard is a JPEG.`,
        );
    }
  }

  const imageAlt = one("og:image:alt");
  if (rawImage) {
    if (imageAlt) add("alt", "pass", "The image has alt text.");
    else add("alt", "fix", "Add og:image:alt: name the site and say what the image shows.");
  }

  const card = one("twitter:card");
  if (card === "summary_large_image") add("card", "pass", "twitter:card asks for the large image.");
  else add("card", "fix", "Set twitter:card to summary_large_image for the larger preview.");

  if (one("og:type") === "article" && !one("article:published_time"))
    add(
      "article",
      "note",
      "This is an article; add article:published_time so previews show its date.",
    );

  return {
    url: page.url,
    host: new URL(page.url).hostname,
    title: title || htmlTitle,
    description: description || one("description"),
    siteName,
    image,
    imageAlt,
    findings,
  };
}
