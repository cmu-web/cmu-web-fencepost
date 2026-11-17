// Screenshots from the command line, the same as the Screenshots page: the
// top of a public page, signed out, with the menu closed, as WebP, or as
// PNG or JPEG when the file name ends in .png or .jpg.
//   npm run gallery -- <address> [file.webp]           a 1040 × 656 card, the
//     size of each project's cmu-web-preview.webp
//   npm run gallery -- <address> [file.webp] --phone   430 × 790 at double
//     resolution, with a status bar, the Web Kilt phone frame's screen
import { writeFile } from "node:fs/promises";
import { loadDomains } from "./domains";
import { makeScreenshot } from "./screenshot";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const kind = args.includes("--phone") ? "phone" : "card";
  const [address, file = kind === "phone" ? "phone.webp" : "gallery.webp"] = args.filter(
    (a) => a !== "--phone",
  );
  if (!address) {
    console.error("Give the page's address: npm run gallery -- <address> [file.webp] [--phone]");
    process.exitCode = 2;
    return;
  }
  const shot = await makeScreenshot(address, kind, loadDomains());
  // The file's extension picks the format: .webp (the default), .png or .jpg
  const ext = file.split(".").pop()?.toLowerCase();
  const pick =
    shot.images.find((f) => f.file.endsWith(`.${ext === "jpeg" ? "jpg" : ext}`)) ?? shot.images[0];
  await writeFile(file, pick.image);
  console.log(`Wrote ${file}: ${shot.title}`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
