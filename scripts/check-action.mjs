// The action (action.yml) runs FencePost's release container image with the
// same version as FencePost, so a release's action runs that release's
// container image. Bump both together.
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const action = readFileSync("action.yml", "utf8");
const image = /RELEASE_IMAGE:\s*ghcr\.io\/cmu-web\/cmu-web-fencepost:(\S+)/.exec(action)?.[1];
if (image !== version) {
  console.error(`action.yml runs container image ${image}; package.json is ${version}`);
  process.exitCode = 1;
} else console.log(`ok: the action runs ${version}`);
