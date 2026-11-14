import { card, openGraph } from "./card";
import { capturePage, publicUrl, type Capture } from "./capture";
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
}

export interface Preview {
  image: Buffer;
  tags: string;
  title: string;
  description: string;
}

export type Capturer = (url: string, allow: (host: string) => boolean) => Promise<Capture>;

export const LIMITS = { title: 100, description: 220, site: 60, screenshotBytes: 8 * 1024 * 1024 };

// The image and the tags for one page, from an uploaded screenshot or a
// capture of the page itself
export async function makePreview(
  req: PreviewRequest,
  domains: Domain[],
  capture: Capturer = capturePage,
): Promise<Preview> {
  const url = publicUrl(req.url).href;
  const site = (req.site || "").slice(0, LIMITS.site);
  const imagePath = req.imagePath || "/images/preview.jpg";
  let source: Capture;
  if (req.screenshot !== undefined) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(req.screenshot))
      throw new GenerateError("Upload a PNG, JPEG or WebP screenshot.");
    const image = Buffer.from(req.screenshot, "base64");
    if (image.length > LIMITS.screenshotBytes)
      throw new GenerateError("Choose a screenshot under 8 MB.");
    if (!req.title?.trim()) throw new GenerateError("Give your uploaded screenshot a title.");
    source = { image, title: req.title, description: "" };
  } else {
    source = await capture(url, (host) => allowedHost(host, domains));
  }
  const title = (req.title?.trim() || source.title).slice(0, LIMITS.title);
  const description = (req.description?.trim() || source.description).slice(0, LIMITS.description);
  const tags = openGraph({ url, title, description, site, imagePath });
  return { image: await card(source.image), tags, title, description };
}
