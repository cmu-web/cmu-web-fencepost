import sharp from "sharp";
import { GenerateError } from "./shared";

// An attribute value in double quotes: only &, " and < need escaping, so an
// apostrophe stays an apostrophe in the tags people paste
const attr = (s: string) =>
  s.replace(/[&"<]/g, (c) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;" })[c]!);

export interface CardOptions {
  title: string;
  description: string;
  site: string;
  url: string;
  imagePath: string;
  /** What the image is: a capture or upload of the page, or someone's own image */
  source?: "page" | "image";
}

// The Open Graph and Twitter tags for a page, with the image at imagePath on
// the page's own site
export function openGraph(options: CardOptions): string {
  const { title, description, site, url, imagePath, source = "page" } = options;
  // The page's own name, without the site or university after it
  const name = title.split(/ [-|–] /)[0].trim() || site || "the page";
  let image: URL;
  try {
    image = new URL(imagePath, url);
  } catch {
    throw new GenerateError("Enter a link to the page and where you'll save the image.");
  }
  if (!["http:", "https:"].includes(image.protocol) || !/^https?:\/\//i.test(url))
    throw new GenerateError("Use http or https addresses for your page and hosted image.");
  return [
    ["og:type", "website"],
    ["og:site_name", site],
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ["og:image", image.href],
    ["og:image:width", "1200"],
    ["og:image:height", "630"],
    [
      "og:image:alt",
      source === "page" ? `A screenshot of ${name}.` : `The preview image for ${name}.`,
    ],
  ]
    .map(([property, content]) => `<meta property="${property}" content="${attr(content)}" />`)
    .concat('<meta name="twitter:card" content="summary_large_image" />')
    .join("\n");
}

// A 1200 × 630 JPEG under 300 KB: from the top of a screenshot, or the
// middle of an image someone already has
export async function card(image: Buffer, position: "top" | "centre" = "top"): Promise<Buffer> {
  try {
    const metadata = await sharp(image, { limitInputPixels: 24_000_000 }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format || "")) throw new Error("format");
    for (const quality of [85, 75, 65, 50, 35, 20]) {
      const output = await sharp(image, { limitInputPixels: 24_000_000 })
        .rotate()
        .resize(1200, 630, { fit: "cover", position })
        .flatten({ background: "white" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (output.length <= 300_000) return output;
    }
    throw new Error("size");
  } catch {
    throw new GenerateError("Use a PNG, JPEG or WebP image under 24 megapixels.");
  }
}
