// Screenshots of the two made-up pages in FencePost's hero, which the home
// page frames with the Web Kilt (cmu-hero-art--phone):
//   scripts/hero/network.html -> docs/images/hero-browser.webp, 4:3, the
//     browser window's content
//   scripts/hero/chat.html    -> docs/images/hero-phone.webp, 430 × 790 at
//     double resolution, the phone's screen
// Run: node scripts/render-hero.mjs. Open the pages in a browser to edit.
import { chromium } from "playwright";
import sharp from "sharp";

const shots = [
  { page: "network.html", out: "hero-browser.webp", width: 870, height: 653, size: [1740, 1306] },
  { page: "chat.html", out: "hero-phone.webp", width: 480, height: 882, size: [860, 1580] },
];
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
try {
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
    });
    await page.goto(new URL(`hero/${shot.page}`, import.meta.url).href);
    await page
      .locator("img")
      .evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    await sharp(await page.screenshot())
      .resize(...shot.size, { fit: "cover", position: "top" })
      .webp({ quality: 88 })
      .toFile(new URL(`../docs/images/${shot.out}`, import.meta.url).pathname);
    console.log(`Rendered ${shot.out}: ${shot.size.join(" x ")}`);
    await page.close();
  }
} finally {
  await browser.close();
}
