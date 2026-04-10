import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PreviewConfig } from "./app-model.js";
import { resolvePreviewConfigFromEnv } from "./preview-config.js";
import { detectContentType, renderShellAppMarkup, renderStaticIndexHtml } from "./static-bundle.js";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type AssetMap = {
  scriptPath: string;
  stylesheetPaths: string[];
  byPath: Map<string, { contents: Uint8Array; contentType: string }>;
};

await startStaticPreviewServer();

async function startStaticPreviewServer(): Promise<void> {
  const previewConfig = resolvePreviewConfig();
  const assets = await buildAssets(previewConfig);
  const host = process.env.CSH_BROWSER_HOST || "127.0.0.1";
  const port = Number.parseInt(process.env.CSH_BROWSER_PORT || "4318", 10);
  const server = Bun.serve({
    hostname: host,
    port,
    fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") {
        return new Response(renderHtml(assets, previewConfig), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      if (request.method === "GET" && url.pathname === "/healthz") {
        return Response.json({ ok: true, mode: previewConfig.modeLabel });
      }
      const asset = assets.byPath.get(url.pathname);
      if (request.method === "GET" && asset) {
        return new Response(new Blob([asset.contents]), {
          headers: {
            "content-type": asset.contentType,
            "cache-control": "no-store",
          },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  console.error(`csh static browser preview listening on http://${server.hostname}:${server.port}`);
}

async function buildAssets(previewConfig: PreviewConfig): Promise<AssetMap> {
  const build = await Bun.build({
    entrypoints: [path.join(PROJECT_ROOT, "src", "browser-static", "app.ts")],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    sourcemap: "none",
    naming: "[name].[ext]",
    define: {
      __CSH_BROWSER_ENABLE_TEST_SIGNER__: previewConfig.enableTestSigner ? "true" : "false",
    },
  });

  if (!build.success) {
    const messages = build.logs.map((log) => log.message).join("\n");
    throw new Error(`Failed to bundle static browser UI:\n${messages}`);
  }

  const byPath = new Map<string, { contents: Uint8Array; contentType: string }>();
  let scriptPath = "";
  const stylesheetPaths: string[] = [];
  for (const output of build.outputs) {
    const basename = path.basename(output.path);
    const routePath = `/assets/${basename}`;
    const contents = new Uint8Array(await output.arrayBuffer());
    byPath.set(routePath, { contents, contentType: detectContentType(routePath) });
    if (routePath.endsWith(".css")) {
      stylesheetPaths.push(routePath);
    } else if (routePath.endsWith(".js")) {
      scriptPath = routePath;
    }
  }
  if (!scriptPath) {
    throw new Error("Static browser preview bundle did not emit a JavaScript asset");
  }
  return { scriptPath, stylesheetPaths, byPath };
}

function resolvePreviewConfig(): PreviewConfig {
  return resolvePreviewConfigFromEnv(process.env);
}

function renderHtml(assets: AssetMap, previewConfig: PreviewConfig): string {
  return renderStaticIndexHtml({
    scriptPath: assets.scriptPath,
    stylesheetPaths: assets.stylesheetPaths,
    previewConfig,
    appMarkup: renderShellAppMarkup(previewConfig),
  });
}
