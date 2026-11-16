// CMU Web gallery shots: the top of a public page, signed out, with the menu
// closed, as WebP. The same capture and site rules as a link preview.
//   npm run gallery -- <address> [file.webp]           1040 x 656, the size
//     of each project's cmu-web-preview.webp
//   npm run gallery -- <address> [file.webp] --phone   390 x 844 at double
//     resolution, with a status bar, for the Web Kilt's phone frame
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { capturePage, GALLERY_SIZE, PHONE_SIZE } from "./capture";
import { allowedHost, loadDomains } from "./domains";
import { withStatusBar } from "./statusbar";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const phone = args.includes("--phone");
  const [address, file = phone ? "phone.webp" : "gallery.webp"] = args.filter(
    (a) => a !== "--phone",
  );
  if (!address) {
    console.error("Give the page's address: npm run gallery -- <address> [file.webp] [--phone]");
    process.exitCode = 2;
    return;
  }
  const domains = loadDomains();
  const allow = (host: string) => allowedHost(host, domains);
  const shot = phone
    ? await capturePage(address, allow, PHONE_SIZE, 2)
    : await capturePage(address, allow, GALLERY_SIZE);
  const image = phone ? await withStatusBar(shot.image, 2) : shot.image;
  await writeFile(file, await sharp(image).webp({ quality: 85 }).toBuffer());
  console.log(`Wrote ${file}: ${shot.title}`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
