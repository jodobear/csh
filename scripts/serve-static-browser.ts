#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import path from "node:path";

import { repoRoot } from "./config";
import { resolvePreviewConfigFromEnv } from "../src/browser-static/preview-config";
import { detectContentType, renderShellAppMarkup, renderStaticIndexHtml } from "../src/browser-static/static-bundle";

const rootDir = repoRoot();
const distDir = path.join(rootDir, "dist", "browser-static");
const manifest = JSON.parse(await readFile(path.join(distDir, "manifest.json"), "utf8")) as {
  scriptPath: string;
  stylesheetPaths: string[];
  assetPaths: string[];
};
const previewConfig = resolvePreviewConfigFromEnv(process.env);
const html = renderStaticIndexHtml({
  scriptPath: manifest.scriptPath,
  stylesheetPaths: manifest.stylesheetPaths,
  previewConfig: {
    ...previewConfig,
    modeLabel: "static-dist",
  },
  appMarkup: renderShellAppMarkup({
    ...previewConfig,
    modeLabel: "static-dist",
  }),
});

const host = process.env.CSH_BROWSER_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.CSH_BROWSER_PORT || "43381", 10);

const server = Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    if (request.method === "GET" && url.pathname === "/healthz") {
      return Response.json({ ok: true, mode: "static-dist" });
    }
    if (!manifest.assetPaths.includes(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }
    const filePath = path.join(distDir, path.basename(url.pathname));
    return new Response(await Bun.file(filePath).bytes(), {
      headers: {
        "content-type": detectContentType(url.pathname),
        "cache-control": "no-store",
      },
    });
  },
});

console.error(`csh static browser dist listening on http://${server.hostname}:${server.port}`);
