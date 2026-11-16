// A CMU Web gallery shot: the top of a public page at 1040 x 656, signed out,
// with the menu closed, as WebP, the size of each project's
// cmu-web-preview.webp. The same capture and site rules as a link preview.
//   npm run gallery -- <address> [file.webp]
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { capturePage, GALLERY_SIZE } from "./capture";
import { allowedHost, loadDomains } from "./domains";

async function main(): Promise<void> {
  const [address, file = "gallery.webp"] = process.argv.slice(2);
  if (!address) {
    console.error("Give the page's address: npm run gallery -- <address> [file.webp]");
    process.exitCode = 2;
    return;
  }
  const domains = loadDomains();
  const shot = await capturePage(address, (host) => allowedHost(host, domains), GALLERY_SIZE);
  await writeFile(file, await sharp(shot.image).webp({ quality: 85 }).toBuffer());
  console.log(`Wrote ${file}: ${shot.title}`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
