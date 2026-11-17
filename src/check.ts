import sharp from "sharp";
import { publicFetch, publicUrl, type Fetched } from "./capture";
import { GenerateError } from "./shared";

// One finding: pass, fix (against the Web Kilt's Link Previews standard) or
// a note worth knowing
export interface Finding {
  key: string;
  status: "pass" | "fix" | "note";
  text: string;
  /** For a fix or note: the tag it's about, shown in bold before the text */
  tag?: string;
  /** For a fix or note: the section of the standard that covers it */
  standard?: { title: string; url: string };
}

/** The Web Kilt's Link Previews standard and the section for each finding */
export const STANDARD = "https://webkilt.andrew.cmu.edu/0/previews.html";
const SECTIONS = {
  image: "Make a Preview Image",
  tags: "Open Graph Tags",
  articles: "News Stories and Posts",
} as const;
function section(key: string): keyof typeof SECTIONS {
  if (key.startsWith("article")) return "articles";
  if (/^(image|alt)/.test(key)) return "image";
  return "tags";
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
// A count in words, as AP style writes numbers under 10: "twice," "three times"
const COUNTS = ["", "once", "twice", "three", "four", "five", "six", "seven", "eight", "nine"];
function times(n: number): string {
  return n < 3 ? COUNTS[n] : `${n < 10 ? COUNTS[n] : n} times`;
}

export async function checkLink(
  input: string,
  allow: (host: string) => boolean,
  fetcher: Fetcher = publicFetch,
  /** The person says the page is a news story or post */
  article = false,
): Promise<CheckResult> {
  publicUrl(input);
  const page: Fetched = await fetcher(input, allow);
  if (!/html/i.test(page.type)) throw new GenerateError("That address isn't a web page.");
  const { tags, title: htmlTitle } = readTags(page.body.toString("utf8"));
  const one = (k: string) => tags.get(k)?.[0]?.trim() || "";
  const findings: Finding[] = [];
  const add = (key: string, status: Finding["status"], text: string, tag?: string) => {
    const id = section(key);
    findings.push(
      status === "pass"
        ? { key, status, text }
        : {
            key,
            status,
            text,
            ...(tag ? { tag } : {}),
            standard: { title: SECTIONS[id], url: `${STANDARD}#${id}` },
          },
    );
  };

  for (const k of ["og:title", "og:description", "og:image", "og:url"])
    if ((tags.get(k)?.length || 0) > 1)
      add(
        `${k}-twice`,
        "fix",
        `It's there ${times(tags.get(k)!.length)}. A CMS may already write it; remove the extra copy.`,
        k,
      );

  const title = one("og:title");
  if (title) add("title", "pass", `The title is "${title}".`);
  else add("title", "fix", "Add the page's name, then the site's.", "og:title");

  const description = one("og:description");
  if (!description)
    add("description", "fix", "Add one short sentence about the page.", "og:description");
  else if (description.length > 200)
    add(
      "description",
      "note",
      "It's long; apps may cut it off after about 200 characters.",
      "og:description",
    );
  else add("description", "pass", "The description is short enough to show in full.");

  const siteName = one("og:site_name");
  if (siteName) add("site", "pass", `The site's name is "${siteName}".`);
  else add("site", "fix", "Add the site's name.", "og:site_name");

  const ogUrl = one("og:url");
  if (!ogUrl) add("url", "fix", "Add the page's full https:// address.", "og:url");
  else if (!/^https:\/\//i.test(ogUrl))
    add("url", "fix", "Give it a full https:// address.", "og:url");
  else if (ogUrl.replace(/\/$/, "") !== page.url.replace(/\/$/, ""))
    add("url", "note", `It points to ${ogUrl}, not to this address.`, "og:url");
  else add("url", "pass", "og:url is this page's full address.");

  let image: ImageInfo | undefined;
  const rawImage = one("og:image");
  if (!rawImage)
    add("image", "fix", "Add the site's preview image, 1200 × 630 pixels.", "og:image");
  else {
    if (!/^https:\/\//i.test(rawImage))
      add("image-address", "fix", "Give it a full https:// address, not a path.", "og:image");
    image = await imageInfo(new URL(rawImage, page.url).href, fetcher);
    if (image.error) add("image", "fix", `The image didn't load: ${image.error}`, "og:image");
    else {
      if (image.width === 1200 && image.height === 630)
        add("image-size", "pass", "The image is 1200 × 630 pixels.");
      else
        add(
          "image-size",
          "fix",
          `Make the image 1200 × 630 pixels; it's ${image.width} × ${image.height}.`,
          "og:image",
        );
      if (image.bytes! > 300_000)
        add(
          "image-bytes",
          "fix",
          `Make the image under 300 KB; it's ${Math.round(image.bytes! / 1000)} KB.`,
          "og:image",
        );
      else add("image-bytes", "pass", `The image is ${Math.round(image.bytes! / 1000)} KB.`);
      if (image.format !== "jpeg")
        add(
          "image-type",
          "note",
          `The image is a ${image.format?.toUpperCase()}; the standard calls for a JPEG.`,
          "og:image",
        );
    }
  }

  const imageAlt = one("og:image:alt");
  if (rawImage) {
    if (imageAlt) add("alt", "pass", "The image has alt text.");
    else add("alt", "fix", "Name the site and say what the image shows.", "og:image:alt");
  }

  const card = one("twitter:card");
  if (card === "summary_large_image") add("card", "pass", "twitter:card asks for the large image.");
  else add("card", "fix", "Set it to summary_large_image for the large preview.", "twitter:card");

  // Author and date: for articles only, as the standard explains. When the
  // person says the page is one, missing ones are fixes; when only the page
  // says so (og:type), they're notes. Other pages aren't checked.
  const isArticle = one("og:type") === "article";
  if (article || isArticle) {
    const missing = article ? "fix" : "note";
    if (article)
      add(
        "article-type",
        isArticle ? "pass" : "fix",
        isArticle ? "og:type says it's an article." : "Set it to article.",
        "og:type",
      );
    if (one("article:published_time"))
      add("article-date", "pass", "The article has its publication date.");
    else
      add(
        "article-date",
        missing,
        "Add the date and time it was published, so previews can show it.",
        "article:published_time",
      );
    if (one("article:author") || one("author"))
      add("article-author", "pass", "The article names its author.");
    else
      add(
        "article-author",
        missing,
        "Add the author's name, so previews can credit them.",
        "article:author",
      );
  }

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
