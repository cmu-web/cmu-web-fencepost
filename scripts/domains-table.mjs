// Reference's Approved Sites table, from domains.json, so the page always
// lists what FencePost accepts. npm run docs writes it; npm run check runs
// this with --check and fails when the page is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import * as prettier from "prettier";

const file = "docs/reference.html";
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const domains = JSON.parse(readFileSync("domains.json", "utf8"));
// One row per group, with every domain it has (such as an old and a new
// address), sorted by group
const groups = new Map();
for (const d of domains) groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
// A site's www. address counts too, but only a bare domain (two parts) has one
// worth naming; cmu-web.github.io doesn't
const site = (d) =>
  `<code>${esc(d.domain)}</code>${
    d.subdomains
      ? " and its subdomains"
      : d.domain.split(".").length === 2
        ? ` and <code>www.${esc(d.domain)}</code>`
        : ""
  }`;
const rows = [...groups]
  .sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))
  .map(
    ([group, list]) =>
      `<tr><th scope="row">${esc(group)}</th><td>${list.map(site).join("<br />")}</td></tr>`,
  )
  .join("\n");
const table = `<table class="alternate cmu-full"><thead><tr><th scope="col">Group</th><th scope="col">Site</th></tr></thead><tbody>
${rows}
</tbody></table>`;

const text = readFileSync(file, "utf8");
const pattern = /<!-- domains:start -->[\s\S]*?<!-- domains:end -->/;
if (!pattern.test(text)) throw new Error(`${file} is missing its domains markers`);
const next = await prettier.format(
  text.replace(pattern, `<!-- domains:start -->\n${table}\n<!-- domains:end -->`),
  { ...(await prettier.resolveConfig(file)), filepath: file },
);
if (next === text) console.log(`ok: Approved Sites lists all ${domains.length} domains`);
else if (process.argv.includes("--check")) {
  console.error(`${file}: Approved Sites is out of date; run npm run docs`);
  process.exitCode = 1;
} else {
  writeFileSync(file, next);
  console.log(`wrote Approved Sites: ${domains.length} domains`);
}
