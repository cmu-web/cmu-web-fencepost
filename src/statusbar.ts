// A phone's status bar over a screenshot taken at a phone's size, so it looks
// like a screenshot taken on the phone itself: the page's own top color across
// the bar, as phones tint it, with the time, signal and battery in white or
// near-black, whichever reads better on that color. The Web Kilt's phone frame
// (cmu-shot--phone) puts its camera over this bar.
import sharp from "sharp";

/** The status bar's height in CSS pixels */
export const STATUS_BAR = 47;

type Rgb = [number, number, number];

// WCAG relative luminance
function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** White or near-black, whichever contrasts more with the color */
export function inkFor(color: Rgb): string {
  const l = luminance(color);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (luminance([29, 33, 37]) + 0.05);
  return onWhite >= onDark ? "#fff" : "#1d2125";
}

/** The average color of the image's top edge */
export async function topColor(png: Buffer): Promise<Rgb> {
  const { width = 1 } = await sharp(png).metadata();
  const { data } = await sharp(png)
    .extract({ left: 0, top: 0, width, height: 2 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
  const n = data.length / 3;
  return sum.map((v) => Math.round(v / n)) as Rgb;
}

/** The screenshot with a status bar above it, as PNG */
export async function withStatusBar(png: Buffer, scale = 1): Promise<Buffer> {
  const { width = 0, height = 0 } = await sharp(png).metadata();
  const bg = await topColor(png);
  const ink = inkFor(bg);
  const s = scale,
    bar = STATUS_BAR * s,
    mid = bar / 2;
  const signal = [5, 7.5, 10, 12.5]
    .map(
      (h, i) =>
        `<rect x="${width - 95 * s + i * 6 * s}" y="${mid + 6 * s - h * s}" width="${3.5 * s}" height="${h * s}" rx="${1 * s}"/>`,
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${bar}" fill="${ink}">` +
    `<text x="${30 * s}" y="${mid}" dominant-baseline="central" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif" font-weight="700" font-size="${15 * s}">9:41</text>` +
    signal +
    `<rect x="${width - 60 * s}" y="${mid - 6 * s}" width="${23 * s}" height="${12 * s}" rx="${3 * s}" fill="none" stroke="${ink}" stroke-width="${1.5 * s}"/>` +
    `<rect x="${width - 57.5 * s}" y="${mid - 3.5 * s}" width="${14.5 * s}" height="${7 * s}" rx="${1.5 * s}"/>` +
    `<rect x="${width - 35.5 * s}" y="${mid - 2.5 * s}" width="${2 * s}" height="${5 * s}" rx="${1 * s}"/>` +
    "</svg>";
  return sharp({
    create: {
      width,
      height: height + bar,
      channels: 3,
      background: { r: bg[0], g: bg[1], b: bg[2] },
    },
  })
    .composite([
      { input: png, top: bar, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();
}
