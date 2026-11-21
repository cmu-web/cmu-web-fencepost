// Screenshots of a public page, signed out, with the menu closed: a card for
// a gallery or an About page, or the page on a phone for the Web Kilt's phone
// frame. The same capture and site rules as a link preview. Used by the
// Screenshots page (/api/screenshot) and npm run gallery.
import sharp from "sharp";
import { capturePage, checkDelay, GALLERY_SIZE, PHONE_SIZE, publicUrl } from "./capture";
import { allowedHost, type Domain } from "./domains";
import type { Capturer } from "./preview";
import { GenerateError } from "./shared";
import { withStatusBar } from "./statusbar";

export const KINDS = {
  card: { size: GALLERY_SIZE, scale: 1, name: "card" },
  phone: { size: PHONE_SIZE, scale: 2, name: "phone" },
} as const;

// Each screenshot comes in all three, so a page can switch between them
// without capturing again: WebP is smallest, PNG is lossless, JPEG goes
// anywhere. The first is the default.
export const FORMATS = {
  webp: { type: "image/webp", ext: "webp" },
  png: { type: "image/png", ext: "png" },
  jpeg: { type: "image/jpeg", ext: "jpg" },
} as const;
export type Format = keyof typeof FORMATS;
export type Kind = keyof typeof KINDS;

// The file's name, from the page: its site and path, then the kind, such as
// cmu-edu-teaching-phone for www.cmu.edu/teaching/. Lowercase, hyphens for
// everything else, www. dropped, kept to 60 characters before the kind.
export function fileStem(url: string, kind: string): string {
  let where = "page";
  try {
    const u = new URL(url);
    where =
      (u.hostname.replace(/^www\./, "") + u.pathname)
        .toLowerCase()
        .replace(/\.(html?|php|aspx?)$/, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)
        .replace(/-+$/, "") || "page";
  } catch {
    // An address that won't parse keeps the plain name
  }
  return `${where}-${kind}`;
}

export interface ScreenshotFile {
  format: Format;
  type: string;
  file: string;
  image: Buffer;
}
export interface Screenshot {
  images: ScreenshotFile[];
  width: number;
  height: number;
  title: string;
}

export async function makeScreenshot(
  url: string,
  kind: string,
  domains: Domain[],
  capture: Capturer = capturePage,
  /** Seconds to wait after the page loads (0 to 10) */
  delay = 0,
): Promise<Screenshot> {
  if (!(kind in KINDS)) throw new GenerateError("Choose a card or a phone.");
  const wait = checkDelay(delay);
  const { size, scale, name } = KINDS[kind as Kind];
  const shot = await capture(
    publicUrl(url).href,
    (host) => allowedHost(host, domains),
    size,
    scale,
    wait,
  );
  // Exactly the size asked for, from the top, whatever the capture returned
  let image: Buffer = await sharp(shot.image)
    .resize(size.width * scale, size.height * scale, { fit: "cover", position: "top" })
    .png()
    .toBuffer();
  if (kind === "phone") image = await withStatusBar(image, scale);
  const meta = await sharp(image).metadata();
  const encode: Record<Format, () => Promise<Buffer>> = {
    webp: () => sharp(image).webp({ quality: 85 }).toBuffer(),
    png: () => sharp(image).png({ compressionLevel: 9 }).toBuffer(),
    jpeg: () => sharp(image).jpeg({ quality: 88, mozjpeg: true }).toBuffer(),
  };
  const images = await Promise.all(
    (Object.keys(FORMATS) as Format[]).map(async (format) => ({
      format,
      type: FORMATS[format].type,
      file: `${fileStem(url, name)}.${FORMATS[format].ext}`,
      image: await encode[format](),
    })),
  );
  return {
    images,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    title: shot.title,
  };
}
