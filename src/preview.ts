import sharp from "sharp";
import { card, openGraph } from "./card";
import {
  capturePage,
  checkDelay,
  publicFetch,
  publicUrl,
  withScheme,
  type Capture,
} from "./capture";
import { readTags } from "./check";
import { allowedHost, type Domain } from "./domains";
import { GenerateError } from "./shared";

export interface PreviewRequest {
  url: string;
  title?: string;
  description?: string;
  site?: string;
  imagePath?: string;
  // Base64 PNG, JPEG or WebP; when given, nothing is fetched
  screenshot?: string;
  // A link to an image that already exists, on the same sites as pages; the
  // page's own title and description are still read from its link
  imageUrl?: string;
  // Seconds to wait after the page loads before capturing it (0 to 10); only
  // a capture waits
  delay?: number;
}

export interface Preview {
  image: Buffer;
  tags: string;
  title: string;
  description: string;
  // With an image link: true when the image already meets the standard, so
  // the tags point to it and there's nothing to save
  linked?: boolean;
  // With an image link that doesn't meet the standard: what's off, in the
  // words Check a Link uses
  imageFixes?: string[];
}

// What keeps an existing image from being a preview image as it is: 1200 x
// 630 pixels, a JPEG and under 300 KB
export async function imageFixes(image: Buffer): Promise<string[]> {
  const meta = await sharp(image, { limitInputPixels: 24_000_000 }).metadata();
  const fixes: string[] = [];
  if (meta.width !== 1200 || meta.height !== 630)
    fixes.push(`It's ${meta.width} × ${meta.height} pixels; previews use 1200 × 630.`);
  if (meta.format !== "jpeg")
    fixes.push(`It's a ${(meta.format || "different format").toUpperCase()}; previews use a JPEG.`);
  if (image.length > 300_000)
    fixes.push(`It's ${Math.round(image.length / 1000)} KB; previews stay under 300 KB.`);
  return fixes;
}

export type Capturer = (
  url: string,
  allow: (host: string) => boolean,
  size?: { width: number; height: number },
  scale?: number,
  /** Seconds to wait after the page loads (0 to 10) */
  delay?: number,
) => Promise<Capture>;

export const LIMITS = { title: 100, description: 220, site: 60, screenshotBytes: 8 * 1024 * 1024 };

// The image and the tags for one page, from an uploaded screenshot or a
// capture of the page itself
export async function makePreview(
  req: PreviewRequest,
  domains: Domain[],
  capture: Capturer = capturePage,
): Promise<Preview> {
  const url = publicUrl(req.url).href;
  const delay = checkDelay(req.delay);
  const site = (req.site || "").slice(0, LIMITS.site);
  const imagePath = req.imagePath || "/images/preview.jpg";
  let source: Capture;
  let imageFixesFound: string[] | undefined;
  if (req.screenshot !== undefined) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(req.screenshot))
      throw new GenerateError("Upload a PNG, JPEG or WebP screenshot.");
    const image = Buffer.from(req.screenshot, "base64");
    if (image.length > LIMITS.screenshotBytes)
      throw new GenerateError("Choose a screenshot under 8 MB.");
    if (!req.title?.trim()) throw new GenerateError("Give your uploaded screenshot a title.");
    source = { image, title: req.title, description: "" };
  } else if (req.imageUrl !== undefined) {
    const allow = (host: string) => allowedHost(host, domains);
    const got = await publicFetch(withScheme(req.imageUrl), allow);
    if (!/^image\//i.test(got.type)) throw new GenerateError("That image link isn't an image.");
    // The title and description come from the page itself, as for a capture
    let title = "",
      description = "";
    try {
      const page = await publicFetch(url, allow);
      const { tags, title: htmlTitle } = readTags(page.body.toString("utf8"));
      title = tags.get("og:title")?.[0] || htmlTitle;
      description = tags.get("og:description")?.[0] || tags.get("description")?.[0] || "";
    } catch (error) {
      if (!req.title?.trim() && error instanceof GenerateError && error.code?.startsWith("robots-"))
        throw new GenerateError(
          `${error.message} Enter a title to use the linked image.`,
          error.status,
          error.code,
        );
      if (!req.title?.trim())
        throw new GenerateError("FencePost couldn't read the page, so give it a title.");
    }
    source = { image: got.body, title, description, position: "centre" };
    const fixes = await imageFixes(got.body).catch(() => {
      throw new GenerateError("That image link isn't an image.");
    });
    const linkedTitle = (req.title?.trim() || title).slice(0, LIMITS.title);
    const linkedDescription = (req.description?.trim() || description).slice(0, LIMITS.description);
    // The image already meets the standard: the tags point to it as it is
    if (!fixes.length)
      return {
        image: got.body,
        tags: openGraph({
          url,
          title: linkedTitle,
          description: linkedDescription,
          site,
          imagePath: withScheme(req.imageUrl),
          source: "image",
        }),
        title: linkedTitle,
        description: linkedDescription,
        linked: true,
      };
    imageFixesFound = fixes;
  } else {
    source = await capture(url, (host) => allowedHost(host, domains), undefined, undefined, delay);
  }
  const title = (req.title?.trim() || source.title).slice(0, LIMITS.title);
  const description = (req.description?.trim() || source.description).slice(0, LIMITS.description);
  const tags = openGraph({
    url,
    title,
    description,
    site,
    imagePath,
    source: req.imageUrl !== undefined ? "image" : "page",
  });
  return {
    image: await card(source.image, source.position),
    tags,
    title,
    description,
    ...(imageFixesFound ? { linked: false, imageFixes: imageFixesFound } : {}),
  };
}
