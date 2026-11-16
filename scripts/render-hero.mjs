// Regenerate the phone artwork with: node scripts/render-hero.mjs
// These styles draw the illustration; the website uses only template and kit CSS
import { chromium } from "playwright";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const preview = await readFile(new URL("../docs/images/webkilt-preview.jpg", import.meta.url));
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
    : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 580, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 22px 30px; font: 24px Arial, sans-serif; color: #24282c; }
      .phone { background: #202226; border: 2px solid #383c43; border-radius: 65px; padding: 18px; box-shadow: 0 9px 20px #172c4b38; }
      .screen { overflow: hidden; border-radius: 46px; background: #f8fafc; }
      .status { height: 54px; background: white; display: flex; justify-content: space-between; align-items: center; padding: 0 28px; font-size: 20px; font-weight: bold; }
      .island { width: 158px; height: 34px; border-radius: 25px; background: #202226; }
      .contact { display: flex; align-items: center; gap: 15px; padding: 12px 24px 18px; background: white; border-bottom: 1px solid #e0e3e6; }
      .avatar { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 50%; background: #e7e9eb; color: #66717a; font-size: 20px; font-weight: bold; }
      .name { font-size: 26px; font-weight: bold; }
      .online { font-size: 18px; color: #78838b; margin-top: 3px; }
      .chat { padding: 18px; }
      .date { margin: 0 0 18px; color: #8a9298; text-align: center; font-size: 16px; }
      .message { width: fit-content; max-width: 90%; padding: 13px 17px; border-radius: 24px; background: #eaecef; margin: 0 0 14px; line-height: 1.3; }
      .reply { margin-left: auto; color: white; background: #305f9b; }
      .preview { overflow: hidden; border: 1px solid #d4d9de; border-radius: 22px; background: white; margin-top: 20px; }
      .preview img { display: block; width: 100%; }
      .details { padding: 16px 18px 20px; }
      .domain { color: #737b83; font-size: 20px; margin: 0 0 9px; }
      .title { margin: 0 0 8px; font-size: 26px; font-weight: bold; }
      .description { margin: 0; color: #626a71; font-size: 22px; line-height: 1.3; }
      .composer { display: flex; align-items: center; gap: 12px; padding: 4px 18px 18px; }
      .url { flex: 1; padding: 13px 17px; background: white; border: 1px solid #d4d9de; border-radius: 30px; font-size: 21px; }
      .send { display: grid; place-items: center; background: #305f9b; color: white; border-radius: 50%; width: 48px; height: 48px; font-size: 28px; }
      .home { width: 150px; height: 6px; border-radius: 5px; background: #202226; margin: 0 auto 12px; }
    </style>
    <div class="phone"><div class="screen">
      <div class="status"><span>9:41</span><span class="island"></span><span>•••</span></div>
      <div class="contact"><div class="avatar">MM</div><div><div class="name">Margaret Morrison</div><div class="online">Online</div></div></div>
      <div class="chat"><p class="date">Today 9:38 AM</p>
        <p class="message">Is there a kit for building our site in CMU's template?</p>
        <p class="message reply">There is! Sending you the link.</p>
        <div class="preview"><img src="data:image/jpeg;base64,${preview.toString("base64")}" alt="Carnegie Mellon Web Kilt home page">
          <div class="details"><p class="domain">webkilt.andrew.cmu.edu</p><p class="title">Carnegie Mellon Web Kilt</p><p class="description">Components and working examples that fit CMU's web template.</p></div>
        </div>
      </div>
      <div class="composer"><span class="url">https://webkilt.andrew.cmu.edu/</span><span class="send">➤</span></div>
      <div class="home"></div>
    </div></div></html>`);
  await page.locator(".preview img").evaluate((image) => image.decode());
  const phone = await page.locator(".phone").boundingBox();
  const height = Math.ceil(phone.y + phone.height + 26);
  await page.setViewportSize({ width: 580, height });
  const png = await page.screenshot({ omitBackground: true });
  await sharp(png)
    .webp({ quality: 92 })
    .toFile(fileURLToPath(new URL("../docs/images/hero.webp", import.meta.url)));
  console.log(`Rendered complete phone: 580 × ${height}`);
} finally {
  await browser.close();
}
