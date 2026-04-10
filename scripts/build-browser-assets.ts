#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { repoRoot } from "./config";
import { buildAssetManifest, renderShellAppMarkup, renderStaticIndexHtml } from "../src/browser-static/static-bundle";
import { resolvePreviewConfigFromEnv } from "../src/browser-static/preview-config";

const rootDir = repoRoot();
const outdir = path.join(rootDir, "dist", "browser-static");
await mkdir(outdir, { recursive: true });

const build = await Bun.build({
  entrypoints: [path.join(rootDir, "src", "browser-static", "app.ts")],
  outdir,
  target: "browser",
  format: "esm",
  splitting: false,
  minify: false,
  sourcemap: "none",
  naming: "[name].[ext]",
  define: {
    __CSH_BROWSER_ENABLE_TEST_SIGNER__: process.env.CSH_BUILD_BROWSER_ENABLE_TEST_SIGNER === "1" ? "true" : "false",
  },
});

if (!build.success) {
  const messages = build.logs.map((log) => log.message).join("\n");
  throw new Error(`Failed to build browser assets:\n${messages}`);
}

let scriptPath = "";
const stylesheetPaths: string[] = [];
const assetPaths: string[] = [];
for (const output of build.outputs) {
  const routePath = `/assets/${path.basename(output.path)}`;
  assetPaths.push(routePath);
  if (routePath.endsWith(".js")) {
    scriptPath = routePath;
  } else if (routePath.endsWith(".css")) {
    stylesheetPaths.push(routePath);
  }
}

if (!scriptPath) {
  throw new Error("Static browser build did not emit an app.js bundle");
}

const manifest = buildAssetManifest({
  scriptPath,
  stylesheetPaths,
  assetPaths,
});
await Bun.write(path.join(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await Bun.write(
  path.join(outdir, "index.html"),
  renderStaticIndexHtml({
    scriptPath,
    stylesheetPaths,
    previewConfig: {
      ...resolvePreviewConfigFromEnv(process.env),
      modeLabel: "static-dist",
    },
    appMarkup: renderShellAppMarkup({
      ...resolvePreviewConfigFromEnv(process.env),
      modeLabel: "static-dist",
    }),
  }),
);

console.log(`Built browser assets in ${outdir}`);
