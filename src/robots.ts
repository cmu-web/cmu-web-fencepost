import { GenerateError } from "./shared";

export const BOT_NAME = "FencePost";
type Rule = { pattern: string; allow: boolean };

// Compare URI octets consistently while keeping escaped delimiters distinct
function normalize(path: string): string {
  return path.replace(/%[\da-f]{2}|\P{ASCII}/giu, (part) => {
    if (!part.startsWith("%")) return encodeURIComponent(part);
    const decoded = String.fromCharCode(parseInt(part.slice(1), 16));
    return /[a-z\d._~-]/i.test(decoded) ? decoded : part.toUpperCase();
  });
}

export function robotsRules(body: string): Rule[] {
  const specific: Rule[] = [];
  const fallback: Rule[] = [];
  let named = false;
  let wildcard = false;
  let started = false;
  let found = false;
  for (const line of body.split(/[\r\n]+/)) {
    const field = /^\s*([\w-]+)\s*:\s*([^#]*)/.exec(line);
    if (!field) continue;
    const name = field[1].toLowerCase();
    const value = field[2].trim();
    if (name === "user-agent") {
      if (started) named = wildcard = false;
      started = false;
      if (value.toLowerCase() === BOT_NAME.toLowerCase()) named = found = true;
      if (value === "*") wildcard = true;
    } else if (name === "allow" || name === "disallow") {
      started = true;
      if (!value.startsWith("/") && !value.startsWith("*")) continue;
      const rule = { pattern: normalize(value), allow: name === "allow" };
      if (named) specific.push(rule);
      else if (wildcard) fallback.push(rule);
    }
  }
  return found ? specific : fallback;
}

// Match literal runs in order, anchoring the final run only for a trailing $
function matches(path: string, pattern: string): boolean {
  const exact = pattern.endsWith("$");
  const parts = (exact ? pattern.slice(0, -1) : pattern).split("*");
  const first = parts.shift()!;
  if (!path.startsWith(first)) return false;
  if (!parts.length) return !exact || path === first;
  let offset = first.length;
  const last = parts.pop()!;
  for (const part of parts) {
    const index = path.indexOf(part, offset);
    if (index < 0) return false;
    offset = index + part.length;
  }
  return exact
    ? path.length - last.length >= offset && path.endsWith(last)
    : path.includes(last, offset);
}

export function checkRobots(url: URL, rules: Rule[]): void {
  const path = normalize(url.pathname + url.search);
  let best: Rule | undefined;
  for (const rule of rules) {
    if (
      matches(path, rule.pattern) &&
      (!best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow))
    )
      best = rule;
  }
  if (best && !best.allow)
    throw new GenerateError(
      `The robots.txt rules for ${url.host} ask FencePost to skip this address.`,
      403,
      "robots-disallowed",
    );
}
