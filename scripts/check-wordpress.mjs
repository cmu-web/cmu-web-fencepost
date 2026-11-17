// The WordPress plugin's version matches FencePost's: its header and its
// readme.txt Stable tag, so a release's fencepost-wordpress.zip says the
// same version as the release.
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const plugin = readFileSync("packages/wordpress/fencepost.php", "utf8");
const readme = readFileSync("packages/wordpress/readme.txt", "utf8");
const found = {
  "fencepost.php Version": /^\s*\*\s*Version:\s*(\S+)/m.exec(plugin)?.[1],
  "readme.txt Stable tag": /^Stable tag:\s*(\S+)/m.exec(readme)?.[1],
};
const wrong = Object.entries(found).filter(([, v]) => v !== version);
if (wrong.length) {
  for (const [where, v] of wrong) console.error(`${where} is ${v}; package.json is ${version}`);
  process.exitCode = 1;
} else console.log(`ok: the WordPress plugin is ${version}`);
