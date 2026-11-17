import type { Express } from "express";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { checkLink, type Fetcher } from "./check";
import { allowedHost, type Domain } from "./domains";
import { LIMITS, makePreview, type Capturer } from "./preview";
import { GenerateError } from "./shared";

const version = (
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")) as { version: string }
).version;

export function createMcp(
  domains: Domain[],
  capture?: Capturer,
  fetcher?: Fetcher,
  base = process.env.PUBLIC_URL || "https://fencepost.andrew.cmu.edu",
) {
  const server = new McpServer(
    { name: "fencepost", title: "FencePost", version },
    {
      instructions:
        "Check a page's link preview with check_link, or generate one with generate_preview: a 1200 × 630 JPEG under 300 KB and the Open Graph tags. Save the image with the site, at imagePath, before publishing the tags. FencePost captures cmu.edu pages and approved Carnegie Mellon domains, signed out, and stores nothing.",
    },
  );
  server.registerTool(
    "get_guide",
    {
      description: "Get FencePost's rules for link previews and which sites it can capture.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ({
      content: [
        {
          type: "text",
          text: `check_link takes url and reports what a share would show and what to fix. generate_preview takes url (a public page on cmu.edu or an approved Carnegie Mellon domain), and optionally title (up to ${LIMITS.title} characters), description (up to ${LIMITS.description}), site (the site's name, up to ${LIMITS.site}), imagePath (where the site will host the image, default /images/preview.jpg), screenshot (base64 PNG, JPEG or WebP under 8 MB, to skip the capture) and imageUrl (a link to an existing image on the same sites, used instead of a capture: if it's already 1200 × 630, a JPEG and under 300 KB, the tags point to it and there's nothing to save; otherwise it's cropped to a new JPEG to save, and imageFixes says why). It returns the JPEG and the tags; nothing is stored. Pages are captured signed out, so a page behind a sign-in fails; upload a screenshot instead. Approved domains: ${domains.map((d) => d.domain).join(", ") || "none yet"}. To add one, use the Request a Domain form in the GitHub repository. Full reference: ${base}/reference.html.`,
        },
      ],
    }),
  );
  server.registerTool(
    "check_link",
    {
      title: "Check a Link",
      description:
        "Read a public Carnegie Mellon page's Open Graph tags and preview image, and check them against the Web Kilt's Link Previews / Open Graph standard. Set article to true for a news story or post, to check its type, date and author. Returns what a share would show and what to fix.",
      inputSchema: { url: z.string().url().max(2048), article: z.boolean().optional() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ url, article }) => {
      try {
        const result = await checkLink(
          url,
          (host) => allowedHost(host, domains),
          fetcher,
          article === true,
        );
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: e instanceof GenerateError ? e.message : "That check didn't work. Try again.",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "generate_preview",
    {
      title: "Make a Link Preview",
      description:
        "Capture a public Carnegie Mellon page, or use a base64 screenshot, and return a 1200 × 630 JPEG under 300 KB with its Open Graph tags. Save the image with the site; FencePost stores nothing.",
      inputSchema: {
        url: z.string().url().max(2048),
        title: z.string().max(LIMITS.title).optional(),
        description: z.string().max(LIMITS.description).optional(),
        site: z.string().max(LIMITS.site).optional(),
        imagePath: z.string().max(2048).optional(),
        screenshot: z.string().max(11_200_000).optional(),
        imageUrl: z.string().max(2048).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const preview = await makePreview(args, domains, capture);
        return {
          content: [
            { type: "image", mimeType: "image/jpeg", data: preview.image.toString("base64") },
            {
              type: "text",
              text: JSON.stringify(
                preview.linked
                  ? {
                      linked: true,
                      note: "The image already meets the standard; the tags point to it, so there's nothing to save.",
                      tags: preview.tags,
                    }
                  : {
                      saveAs: args.imagePath || "/images/preview.jpg",
                      width: 1200,
                      height: 630,
                      ...(preview.imageFixes ? { imageFixes: preview.imageFixes } : {}),
                      tags: preview.tags,
                    },
                null,
                2,
              ),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text:
                e instanceof GenerateError
                  ? e.message
                  : "That preview didn't work. Upload a screenshot instead.",
            },
          ],
        };
      }
    },
  );
  return server;
}

export function mountMcp(app: Express, domains: Domain[], capture?: Capturer, fetcher?: Fetcher) {
  app.post("/mcp", express.json({ limit: "12mb" }), async (req, res) => {
    const server = createMcp(domains, capture, fetcher),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent)
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "MCP request failed." },
          id: null,
        });
    }
  });
  app.all("/mcp", (_req, res) => {
    res.status(405).set("Allow", "POST").json({ error: "Use Streamable HTTP POST." });
  });
}
