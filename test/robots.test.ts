import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, it } from "vitest";
import { publicFetch } from "../src/capture";
import { checkRobots, robotsRules } from "../src/robots";

it("combines FencePost groups, uses the longest rule and allows ties", () => {
  const rules = robotsRules(
    [
      "User-agent: *",
      "Disallow: /",
      "User-agent: fEnCePoSt",
      "Disallow: /draft",
      "User-agent: FencePost",
      "Allow: /draft/public",
      "Disallow: /draft/public",
      "Disallow: /*?private=*$",
      "Disallow: /café",
      "Disallow: /%61rchive",
    ].join("\n"),
  );
  for (const path of ["/other", "/draft/public"]) {
    expect(() => checkRobots(new URL(path, "https://example.org"), rules)).not.toThrow();
  }
  for (const path of ["/draft", "/file?private=yes", "/caf%C3%A9", "/archive"]) {
    expect(() => checkRobots(new URL(path, "https://example.org"), rules)).toThrow(/robots.txt/);
  }
});

it("groups user-agent lines and ignores empty and ungrouped rules", () => {
  const rules = robotsRules(
    [
      "Disallow: /early",
      "User-agent: Other",
      "User-agent: FencePost",
      "Disallow: /shared",
      "Disallow:",
      "User-agent: *",
      "Disallow: /",
    ].join("\n"),
  );
  for (const path of ["/early", "/other"])
    expect(() => checkRobots(new URL(path, "https://example.org"), rules)).not.toThrow();
  expect(() => checkRobots(new URL("/shared", "https://example.org"), rules)).toThrow();
  expect(robotsRules("User-agent: *\nDisallow:")).toEqual([]);
});

it.each([200, 404, 503])(
  "checks redirects before fetching and identifies policy requests (%i)",
  async (status) => {
    const requests: string[] = [];
    const agents = new Set<string | undefined>();
    const server = http.createServer((req, res) => {
      requests.push(req.url!);
      agents.add(req.headers["user-agent"]);
      if (req.url === "/robots.txt") {
        res.writeHead(302, { location: "/rules" });
        res.end();
      } else if (req.url === "/rules") {
        res.writeHead(status);
        res.end("User-agent: *\nDisallow: /private");
      } else if (req.url === "/start") {
        res.writeHead(302, { location: "/private" });
        res.end();
      } else res.end("ok");
    });
    await new Promise<void>((resolve, reject) =>
      server.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const fetchPage = () =>
        publicFetch(origin + "/start", undefined, 0, undefined, "local", true);
      if (status === 404) expect((await fetchPage()).body.toString()).toBe("ok");
      else {
        for (let attempt = 0; attempt < 2; attempt++)
          await expect(fetchPage()).rejects.toMatchObject(
            status === 200
              ? {
                  status: 403,
                  code: "robots-disallowed",
                  message: expect.stringContaining("robots.txt"),
                }
              : { status: 503, code: "robots-unavailable" },
          );
        expect(requests).not.toContain("/private");
        if (status === 503) expect(requests).not.toContain("/start");
      }
      expect(requests.filter((path) => path === "/robots.txt")).toHaveLength(1);
      expect([...agents]).toEqual([
        "FencePost/1.0 (link preview; https://fencepost.andrew.cmu.edu/)",
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

// A server on host answering robots.txt with rules, and any other path with
// "ok"; requests records the paths asked for
async function site(rules: string, host = "127.0.0.1") {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url!);
    res.end(req.url === "/robots.txt" ? rules : "ok");
  });
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(0, host, resolve),
  );
  const origin = `http://${host}:${(server.address() as AddressInfo).port}`;
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { origin, requests, close };
}

it("skips robots.txt for local fetches unless asked", async () => {
  const { origin, requests, close } = await site("User-agent: *\nDisallow: /");
  try {
    const got = await publicFetch(origin + "/page", undefined, 0, undefined, "local");
    expect(got.body.toString()).toBe("ok");
    expect(requests).toEqual(["/page"]);
  } finally {
    await close();
  }
});

it("keeps one copy of the rules per site whatever the host filter", async () => {
  const { origin, requests, close } = await site("User-agent: *\nDisallow: /private");
  try {
    for (let i = 0; i < 3; i++)
      await publicFetch(
        origin + "/page",
        (host) => host === "127.0.0.1",
        0,
        undefined,
        "local",
        true,
      );
    expect(requests.filter((path) => path === "/robots.txt")).toHaveLength(1);
  } finally {
    await close();
  }
});

it("follows a robots.txt redirect to a host the filter doesn't list", async () => {
  const rules = await site("User-agent: *\nDisallow: /private", "localhost");
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") res.writeHead(301, { location: rules.origin + "/robots.txt" });
    res.end("ok");
  });
  await new Promise<void>((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const only = (host: string) => host === "127.0.0.1";
    await expect(
      publicFetch(origin + "/private", only, 0, undefined, "local", true),
    ).rejects.toMatchObject({ status: 403, code: "robots-disallowed" });
    expect(
      (await publicFetch(origin + "/page", only, 0, undefined, "local", true)).body.toString(),
    ).toBe("ok");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rules.close();
  }
});
