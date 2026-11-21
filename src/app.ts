import express from "express";
import path from "node:path";
import { checkLink, type Fetcher } from "./check";
import { allowedHost, loadDomains, type Domain } from "./domains";
import { mountMcp } from "./mcp";
import { makePreview, type Capturer } from "./preview";
import { makeScreenshot } from "./screenshot";
import { checkDelay, withScheme } from "./capture";
import { GenerateError } from "./shared";

export function createApp(
  domains: Domain[] = loadDomains(),
  capture?: Capturer,
  fetcher?: Fetcher,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.static(path.join(__dirname, "..", "docs")));
  app.get("/healthz", (_req, res) => {
    res.type("text/plain").send("ok\n");
  });
  // The image and tags as JSON; the image is base64, since nothing is stored
  app.post("/api/preview", express.json({ limit: "12mb" }), async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.url !== "string") throw new GenerateError("Enter a link to a page.");
      const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
      const preview = await makePreview(
        {
          url: withScheme(body.url),
          title: str("title"),
          description: str("description"),
          site: str("site"),
          imagePath: str("imagePath"),
          screenshot: str("screenshot"),
          imageUrl: str("imageUrl"),
          delay: checkDelay(body.delay),
        },
        domains,
        capture,
      );
      res.set("Cache-Control", "no-store").json({
        image: preview.image.toString("base64"),
        type: "image/jpeg",
        width: 1200,
        height: 630,
        title: preview.title,
        description: preview.description,
        tags: preview.tags,
        ...(preview.linked !== undefined
          ? { linked: preview.linked, imageFixes: preview.imageFixes ?? [] }
          : {}),
      });
    } catch (e) {
      const known = e instanceof GenerateError;
      if (!known) console.error("preview failed:", (e as Error).message);
      res.status(known ? e.status : 500).json({
        error: known ? e.message : "That preview didn't work. Try again, or upload a screenshot.",
        ...(known && e.code ? { code: e.code } : {}),
      });
    }
  });
  // A card or phone screenshot as JSON, in WebP, PNG and JPEG (base64)
  app.post("/api/screenshot", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body.url !== "string") throw new GenerateError("Enter a link to a page.");
      const shot = await makeScreenshot(
        withScheme(body.url),
        typeof body.kind === "string" ? body.kind : "card",
        domains,
        capture,
        checkDelay(body.delay),
      );
      res.set("Cache-Control", "no-store").json({
        width: shot.width,
        height: shot.height,
        title: shot.title,
        images: shot.images.map((f) => ({
          format: f.format,
          type: f.type,
          file: f.file,
          bytes: f.image.length,
          image: f.image.toString("base64"),
        })),
      });
    } catch (e) {
      const known = e instanceof GenerateError;
      if (!known) console.error("screenshot failed:", (e as Error).message);
      res.status(known ? e.status : 500).json({
        error: known ? e.message : "That screenshot didn't work. Try again.",
        ...(known && e.code ? { code: e.code } : {}),
      });
    }
  });
  // A page's preview tags and image, checked against the Link Previews standard
  app.post("/api/check", express.json({ limit: "8kb" }), async (req, res) => {
    try {
      const body = (req.body as Record<string, unknown> | undefined) ?? {};
      const url = body.url;
      if (typeof url !== "string") throw new GenerateError("Enter a link to a page.");
      res
        .set("Cache-Control", "no-store")
        .json(
          await checkLink(
            withScheme(url),
            (host) => allowedHost(host, domains),
            fetcher,
            body.article === true,
          ),
        );
    } catch (e) {
      const known = e instanceof GenerateError;
      if (!known) console.error("check failed:", (e as Error).message);
      res.status(known ? e.status : 500).json({
        error: known ? e.message : "That check didn't work. Try again.",
        ...(known && e.code ? { code: e.code } : {}),
      });
    }
  });
  mountMcp(app, domains, capture, fetcher);
  return app;
}
