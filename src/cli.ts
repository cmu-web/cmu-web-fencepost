// Link preview images and screenshots from the command line, for a site that
// isn't published yet: a build serves it inside the job, at an address such
// as http://127.0.0.1:4000/, and FencePost captures it there. The only place
// FencePost reaches private and loopback addresses; the web service and the
// MCP server never do. The GitHub Action (action.yml) runs this.
//   node dist/cli.js <address> [--preview images/preview.jpg] [--card card.webp]
//     [--phone phone.webp] [--public-url https://example.cmu.edu/] [--site Name]
//     [--image-path /images/preview.jpg] [--delay 3] [--outputs github]
// With no --preview, --card or --phone, it writes images/preview.jpg. Card and
// phone files are WebP, PNG or JPEG by their extension. Prints what it wrote
// as JSON, or with --outputs github as lines for $GITHUB_OUTPUT. --delay waits
// that many seconds (0 to 10) after the page loads, for content that animates
// in or loads late.
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { card, openGraph } from "./card";
import { capturePage, checkDelay, publicUrl, withScheme } from "./capture";
import type { Capturer } from "./preview";
import { makeScreenshot, type Kind } from "./screenshot";

// Any site, any address: this runs on the caller's own machine or job
export const localCapture: Capturer = (url, _allow, size, scale, delay) =>
  capturePage(url, () => true, size, scale, delay, "local");

export interface ShootOptions {
  address: string;
  preview?: string;
  card?: string;
  phone?: string;
  /** The page's published address, for the tags; without it, no tags */
  publicUrl?: string;
  site?: string;
  imagePath?: string;
  /** Seconds to wait after the page loads (0 to 10) */
  delay?: number;
}

export interface ShootResult {
  title: string;
  description: string;
  preview?: string;
  card?: string;
  phone?: string;
  tags?: string;
}

async function save(file: string, data: Buffer): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function shoot(
  options: ShootOptions,
  capture: Capturer = localCapture,
): Promise<ShootResult> {
  const address = publicUrl(withScheme(options.address)).href;
  const wants = options.preview || options.card || options.phone;
  const preview = wants ? options.preview : "images/preview.jpg";
  if (preview && !/\.jpe?g$/i.test(preview))
    throw new Error("The preview image is a JPEG; give it a .jpg file name.");
  // No list of sites here: makeScreenshot's list check always passes
  const delay = checkDelay(options.delay);
  const anySite: Capturer = (url, _allow, size, scale, wait) =>
    capture(url, () => true, size, scale, wait);
  const result: ShootResult = { title: "", description: "" };
  if (preview) {
    const shot = await capture(address, () => true, undefined, undefined, delay);
    await save(preview, await card(shot.image));
    result.title = shot.title;
    result.description = shot.description;
    result.preview = preview;
  }
  for (const kind of ["card", "phone"] as Kind[]) {
    const file = options[kind];
    if (!file) continue;
    const shot = await makeScreenshot(address, kind, [], anySite, delay);
    const ext = file.split(".").pop()?.toLowerCase();
    const pick = shot.images.find((f) => f.file.endsWith(`.${ext === "jpeg" ? "jpg" : ext}`));
    if (!pick) throw new Error(`${file}: use a .webp, .png or .jpg file name.`);
    await save(file, pick.image);
    result[kind] = file;
    result.title ||= shot.title;
  }
  if (options.publicUrl)
    result.tags = openGraph({
      url: publicUrl(withScheme(options.publicUrl)).href,
      title: result.title,
      description: result.description,
      site: options.site || "",
      imagePath: options.imagePath || "/images/preview.jpg",
    });
  return result;
}

/** The result as lines for $GITHUB_OUTPUT (GitHub and Forgejo), so the
 *  Action needs nothing but Docker to read it: one line each, and the tags,
 *  which run over several lines, between delimiters */
export function githubOutputs(result: ShootResult, delimiter: string): string {
  const line = (key: keyof ShootResult) =>
    `${key}=${(result[key] || "").replace(/[\r\n]+/g, " ")}\n`;
  return (
    (["title", "description", "preview", "card", "phone"] as const).map(line).join("") +
    `tags<<${delimiter}\n${result.tags || ""}\n${delimiter}\n`
  );
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      preview: { type: "string" },
      card: { type: "string" },
      phone: { type: "string" },
      "public-url": { type: "string" },
      site: { type: "string" },
      "image-path": { type: "string" },
      delay: { type: "string" },
      outputs: { type: "string" },
    },
  });
  if (positionals.length !== 1) {
    console.error(
      "Give the page's address: fencepost <address> [--preview file.jpg] [--card file.webp] [--phone file.webp]",
    );
    process.exitCode = 2;
    return;
  }
  // Empty values (an Action input left blank) count as not given
  const given = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  const result = await shoot({
    address: positionals[0],
    preview: given(values.preview),
    card: given(values.card),
    phone: given(values.phone),
    publicUrl: given(values["public-url"]),
    site: given(values.site),
    imagePath: given(values["image-path"]),
    delay: checkDelay(given(values.delay)),
  });
  for (const kind of ["preview", "card", "phone"] as const)
    if (result[kind]) console.error(`Wrote ${result[kind]}`);
  if (values.outputs === "github")
    process.stdout.write(githubOutputs(result, `fencepost-${randomUUID()}`));
  else console.log(JSON.stringify(result));
}

if (require.main === module)
  main().catch((e: unknown) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  });
