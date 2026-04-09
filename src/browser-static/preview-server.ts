import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type PreviewConfig = {
  defaultRelayUrls: string[];
  defaultServerPubkey: string;
  defaultSignerKind: "nip07" | "bunker" | "amber" | "test";
  enableTestSigner: boolean;
  testSignerPrivateKey?: string;
  modeLabel: string;
};

type AssetMap = {
  scriptPath: string;
  stylesheetPaths: string[];
  byPath: Map<string, { contents: Uint8Array; contentType: string }>;
};

await startStaticPreviewServer();

async function startStaticPreviewServer(): Promise<void> {
  const assets = await buildAssets();
  const host = process.env.CSH_BROWSER_HOST || "127.0.0.1";
  const port = Number.parseInt(process.env.CSH_BROWSER_PORT || "4318", 10);
  const previewConfig = resolvePreviewConfig();
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

async function buildAssets(): Promise<AssetMap> {
  const prebuiltDir = path.join(PROJECT_ROOT, "dist", "browser-static");
  const scriptCandidate = path.join(prebuiltDir, "app.js");
  if (await Bun.file(scriptCandidate).exists()) {
    const byPath = new Map<string, { contents: Uint8Array; contentType: string }>();
    const scriptPath = "/assets/app.js";
    byPath.set(scriptPath, {
      contents: new Uint8Array(await readFile(scriptCandidate)),
      contentType: "text/javascript; charset=utf-8",
    });
    const stylesheetPaths: string[] = [];
    const stylesheetCandidate = path.join(prebuiltDir, "app.css");
    if (await Bun.file(stylesheetCandidate).exists()) {
      const stylesheetPath = "/assets/app.css";
      stylesheetPaths.push(stylesheetPath);
      byPath.set(stylesheetPath, {
        contents: new Uint8Array(await readFile(stylesheetCandidate)),
        contentType: "text/css; charset=utf-8",
      });
    }
    return { scriptPath, stylesheetPaths, byPath };
  }

  const build = await Bun.build({
    entrypoints: [path.join(PROJECT_ROOT, "src", "browser-static", "app.ts")],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    sourcemap: "none",
    naming: "[name].[ext]",
    define: {
      __CSH_BROWSER_ENABLE_TEST_SIGNER__: "true",
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
    byPath.set(routePath, {
      contents,
      contentType: routePath.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8",
    });
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
  const relaySource = process.env.CVM_RELAYS || process.env.CSH_NOSTR_RELAY_URLS || "";
  const relayUrls = relaySource
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    defaultRelayUrls: relayUrls,
    defaultServerPubkey: (process.env.CVM_SERVER_PUBKEY || process.env.CSH_SERVER_PUBKEY || "").trim(),
    defaultSignerKind:
      process.env.CSH_BROWSER_DEFAULT_SIGNER === "test" ? "test" : "nip07",
    enableTestSigner: Boolean(process.env.CVM_CLIENT_PRIVATE_KEY || process.env.CSH_CLIENT_PRIVATE_KEY),
    testSignerPrivateKey: process.env.CVM_CLIENT_PRIVATE_KEY || process.env.CSH_CLIENT_PRIVATE_KEY,
    modeLabel: "static-preview",
  };
}

function renderHtml(assets: AssetMap, previewConfig: PreviewConfig): string {
  const stylesheetLinks = assets.stylesheetPaths
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>csh browser shell</title>
    ${stylesheetLinks}
  </head>
  <body>
    <main class="shell-app">
      <section class="topbar">
        <div class="title">
          <span class="eyebrow">Nostr Native</span>
          <h1>Browser Shell Client</h1>
          <p>Static ContextVM browser client with signer-based shell access and invite onboarding.</p>
        </div>
        <div class="actions">
          <button class="button button-accent" type="button" data-action="connect">Connect</button>
          <button class="button" type="button" data-action="reset">Reset Saved Settings</button>
          <button class="button" type="button" data-action="reconnect">Reconnect</button>
          <button class="button" type="button" data-action="interrupt">Interrupt</button>
          <button class="button button-danger" type="button" data-action="close">Close</button>
        </div>
      </section>
      <section class="settings-card">
        <div class="settings-grid">
          <div class="field field--wide">
            <label for="relays">Relays</label>
            <textarea id="relays" data-field="relays" placeholder="wss://relay.example"></textarea>
          </div>
          <div class="field field--wide">
            <label for="server-pubkey">Server pubkey</label>
            <input id="server-pubkey" data-field="server-pubkey" placeholder="hex pubkey">
          </div>
          <div class="field">
            <label for="signer">Signer</label>
            <select id="signer" data-field="signer">
              <option value="nip07">NIP-07</option>
              <option value="bunker">Bunker</option>
              <option value="amber">Amber</option>
              ${previewConfig.enableTestSigner ? '<option value="test">Preview Test Signer</option>' : ""}
            </select>
          </div>
          <div class="field">
            <label for="bunker-uri">Bunker URI</label>
            <input id="bunker-uri" data-field="bunker-uri" placeholder="bunker://... or nostrconnect://...">
          </div>
          <div class="field field--wide">
            <label for="invite">Invite token</label>
            <input id="invite" data-field="invite" placeholder="Optional one-time invite token">
          </div>
        </div>
        <div class="banner" data-banner>Use a whitelisted signer or redeem a one-time invite before opening the shell.</div>
      </section>
      <section class="statusbar">
        <div>status: <strong data-status>Booting static browser shell...</strong></div>
        <div class="status-meta">mode: <span data-mode>${previewConfig.modeLabel}</span> | actor: <span data-actor>pending</span> | session: <span data-session>pending</span></div>
      </section>
      <section class="terminal-card">
        <div class="terminal-shell" data-terminal></div>
      </section>
    </main>
    <script>
      window.__CSH_BROWSER_STATIC_PREVIEW__ = ${JSON.stringify(previewConfig)};
    </script>
    <script type="module" src="${assets.scriptPath}"></script>
  </body>
</html>`;
}
