import sharp from "sharp";
import { GenerateError, xml } from "./shared";

export interface CardOptions {
  title: string;
  description: string;
  site: string;
  url: string;
  imagePath: string;
}

// The Open Graph and Twitter tags for a page, with the image at imagePath on
// the page's own site
export function openGraph(options: CardOptions): string {
  const { title, description, site, url, imagePath } = options;
  let image: URL;
  try {
    image = new URL(imagePath, url);
  } catch {
    throw new GenerateError(
      "Enter the page URL and the path where you will host the downloaded image.",
    );
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
    ["og:image:alt", `${title}${site ? `, ${site}` : ""}: a screenshot of the page.`],
  ]
    .map(([property, content]) => `<meta property="${property}" content="${xml(content)}" />`)
    .concat('<meta name="twitter:card" content="summary_large_image" />')
    .join("\n");
}

// A 1200 x 630 JPEG under 300 KB from the top of a screenshot
export async function card(image: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(image, { limitInputPixels: 24_000_000 }).metadata();
    if (!["png", "jpeg", "webp"].includes(metadata.format || "")) throw new Error("format");
    for (const quality of [85, 75, 65, 50, 35, 20]) {
      const output = await sharp(image, { limitInputPixels: 24_000_000 })
        .rotate()
        .resize(1200, 630, { fit: "cover", position: "top" })
        .flatten({ background: "white" })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (output.length <= 300_000) return output;
    }
    throw new Error("size");
  } catch {
    throw new GenerateError("Choose a PNG, JPEG or WebP screenshot under 24 megapixels.");
  }
}
