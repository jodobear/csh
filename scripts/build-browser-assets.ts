#!/usr/bin/env bun
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { repoRoot } from "./config";

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
    __CSH_BROWSER_ENABLE_TEST_SIGNER__: "false",
  },
});

if (!build.success) {
  const messages = build.logs.map((log) => log.message).join("\n");
  throw new Error(`Failed to build browser assets:\n${messages}`);
}

console.log(`Built browser assets in ${outdir}`);
