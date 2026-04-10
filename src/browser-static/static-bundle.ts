import type { PreviewConfig } from "./app-model.js";

export type StaticBundleDescriptor = {
  scriptPath: string;
  stylesheetPaths: string[];
};

export type StaticAssetManifest = StaticBundleDescriptor & {
  assetPaths: string[];
};

export function detectContentType(routePath: string): string {
  if (routePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (routePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (routePath.endsWith(".ttf")) {
    return "font/ttf";
  }
  if (routePath.endsWith(".woff2")) {
    return "font/woff2";
  }
  return "application/octet-stream";
}

export function buildAssetManifest(input: StaticAssetManifest): StaticAssetManifest {
  return {
    scriptPath: input.scriptPath,
    stylesheetPaths: [...input.stylesheetPaths],
    assetPaths: [...input.assetPaths].sort(),
  };
}

export function renderStaticIndexHtml(
  input: StaticBundleDescriptor & { modeLabel?: string; previewConfig?: PreviewConfig; appMarkup?: string },
): string {
  const stylesheetLinks = input.stylesheetPaths
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  const previewConfig = input.previewConfig ?? { modeLabel: input.modeLabel ?? "static-dist" };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>csh browser shell</title>
    ${stylesheetLinks}
  </head>
  <body>
    ${input.appMarkup ?? '<main class="shell-app"></main>'}
    <script>
      window.__CSH_BROWSER_STATIC_PREVIEW__ = ${JSON.stringify(previewConfig)};
    </script>
    <script type="module" src="${input.scriptPath}"></script>
  </body>
</html>`;
}

export function renderShellAppMarkup(previewConfig: PreviewConfig): string {
  return `<main class="shell-app">
      <section class="topbar">
        <div class="title">
          <span class="eyebrow">Nostr Native</span>
          <h1>Browser Shell Client</h1>
          <p>Static ContextVM browser client with signer-based shell access and invite onboarding.</p>
        </div>
        <div class="actions">
          <button class="button button-accent" type="button" data-action="connect">Connect</button>
          <button class="button" type="button" data-action="toggle-settings">Hide Setup</button>
          <button class="button" type="button" data-action="reset">Reset Saved Settings</button>
          <button class="button" type="button" data-action="reconnect">Reconnect</button>
          <button class="button" type="button" data-action="interrupt">Interrupt</button>
          <button class="button button-danger" type="button" data-action="close">Close</button>
        </div>
      </section>
      <section class="settings-card">
        <div class="settings-grid">
          <div class="field">
            <label for="profile-select">Saved profile</label>
            <select id="profile-select" data-field="profile-select">
              <option value="manual">Manual Settings</option>
            </select>
          </div>
          <div class="field">
            <label for="profile-import">Import profile JSON</label>
            <textarea id="profile-import" data-field="profile-import" placeholder='{"version":1,"label":"Private Relay","relayUrls":["ws://127.0.0.1:10552"],"serverPubkey":"...","preferredSignerKind":"nip07"}'></textarea>
          </div>
          <div class="field field--wide field-actions">
            <button class="button" type="button" data-action="import-profile">Import Profile</button>
          </div>
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
        <pre class="terminal-output-mirror" data-terminal-output aria-hidden="true"></pre>
      </section>
    </main>`;
}
