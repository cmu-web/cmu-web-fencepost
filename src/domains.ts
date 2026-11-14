import { readFileSync } from "node:fs";
import { join } from "node:path";

// A non-cmu.edu site run by a Carnegie Mellon group (domains.json)
export interface Domain {
  domain: string;
  subdomains?: boolean;
  group: string;
  contact: string;
  added: string;
  request: string;
}

export function loadDomains(file = join(__dirname, "..", "domains.json")): Domain[] {
  return JSON.parse(readFileSync(file, "utf8")) as Domain[];
}

// cmu.edu and its subdomains always; listed domains and their www, or all of
// their subdomains when the entry says so. Matches whole labels only, so
// notcmu.edu and cmu.edu.example.com fail.
export function allowedHost(host: string, domains: Domain[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "cmu.edu" || h.endsWith(".cmu.edu")) return true;
  return domains.some((d) => {
    const domain = d.domain.toLowerCase();
    return (
      h === domain || h === `www.${domain}` || (d.subdomains === true && h.endsWith(`.${domain}`))
    );
  });
}
