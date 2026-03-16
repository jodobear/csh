import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ShellBridge } from "./shell-bridge.js";

const envSchema = z.object({
  CSH_BROWSER_HOST: z.string().trim().min(1).default("127.0.0.1"),
  CSH_BROWSER_PORT: z.coerce.number().int().min(1).max(65535).default(4318),
  CSH_BROWSER_ALLOW_REMOTE: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === "1" || value?.toLowerCase() === "true"),
  CSH_BROWSER_AUTH_USER: z.string().trim().optional(),
  CSH_BROWSER_AUTH_PASSWORD: z.string().trim().optional(),
  CSH_BROWSER_TRUST_PROXY_TLS: z
    .string()
    .trim()
    .optional()
    .transform((value) => value === "1" || value?.toLowerCase() === "true"),
});

const openSchema = z.object({
  command: z.string().optional(),
  cwd: z.string().optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
});

const writeSchema = z.object({
  sessionId: z.string().min(1),
  input: z.string(),
});

const resizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

const signalSchema = z.object({
  sessionId: z.string().min(1),
  signal: z.enum(["SIGINT", "SIGTERM", "SIGHUP"]),
});

const pollSchema = z.object({
  sessionId: z.string().min(1),
  cursor: z.number().int().min(0).optional(),
});

const closeSchema = z.object({
  sessionId: z.string().min(1),
});

type BrowserServerOptions = {
  createShellBridge: () => Promise<ShellBridge>;
  modeLabel: string;
  description: string;
  stateNamespace: string;
};

type BundledAsset = {
  contents: Uint8Array;
  contentType: string;
};

type BundledAssets = {
  scriptPath: string;
  stylesheetPaths: string[];
  byPath: Map<string, BundledAsset>;
};

type BrowserAuth = {
  username: string;
  password: string;
  generated: boolean;
};

export async function startBrowserServer(options: BrowserServerOptions): Promise<void> {
  const env = envSchema.parse(process.env);
  if (!env.CSH_BROWSER_ALLOW_REMOTE && !isLoopbackHost(env.CSH_BROWSER_HOST)) {
    throw new Error(
      `Refusing to bind browser UI to non-loopback host ${env.CSH_BROWSER_HOST} without CSH_BROWSER_ALLOW_REMOTE=1`,
    );
  }
  if (env.CSH_BROWSER_ALLOW_REMOTE && !env.CSH_BROWSER_TRUST_PROXY_TLS) {
    throw new Error(
      "Remote browser mode requires CSH_BROWSER_TRUST_PROXY_TLS=1 and an HTTPS/TLS-terminating reverse proxy.",
    );
  }
  const browserAuth = resolveBrowserAuth(env);

  const apiToken = (process.env.CSH_BROWSER_TOKEN || randomUUID()).trim();
  const assets = await buildBrowserAssets();
  const shellBridge = await options.createShellBridge();
  const noStoreHeaders = {
    "cache-control": "no-store",
  };

  const server = Bun.serve({
    hostname: env.CSH_BROWSER_HOST,
    port: env.CSH_BROWSER_PORT,
    idleTimeout: 30,
    fetch: (request) =>
      handleRequest(request, shellBridge, assets, noStoreHeaders, options, apiToken, browserAuth),
    error(error) {
      console.error(error);
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        {
          status: 500,
          headers: noStoreHeaders,
        },
      );
    },
  });

  console.error(
    `csh browser UI (${options.modeLabel}) listening on http://${server.hostname}:${server.port}`,
  );
  if (browserAuth.generated) {
    console.error(`Browser auth user: ${browserAuth.username}`);
    console.error(`Browser auth password: ${browserAuth.password}`);
  }

  const shutdown = async (exitCode: number): Promise<never> => {
    server.stop(true);
    await shellBridge.close();
    process.exit(exitCode);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await shutdown(0);
    });
  }

  process.on("uncaughtException", async (error) => {
    console.error("Uncaught exception:", error);
    await shutdown(1);
  });

  process.on("unhandledRejection", async (reason) => {
    console.error("Unhandled rejection:", reason);
    await shutdown(1);
  });
}

async function handleRequest(
  request: Request,
  bridge: ShellBridge,
  bundledAssets: BundledAssets,
  noStoreHeaders: HeadersInit,
  options: BrowserServerOptions,
  apiToken: string,
  browserAuth: BrowserAuth | null,
): Promise<Response> {
  const url = new URL(request.url);
  const authError = authorizeBrowserRequest(request, browserAuth);
  if (authError) {
    return new Response(authError, {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "www-authenticate": 'Basic realm="csh browser"',
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(renderHtml(bundledAssets, options, apiToken), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...noStoreHeaders,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    return Response.json({ ok: true, mode: options.modeLabel }, { headers: noStoreHeaders });
  }

  const asset = bundledAssets.byPath.get(url.pathname);
  if (request.method === "GET" && asset) {
    const body = new Uint8Array(asset.contents.byteLength);
    body.set(asset.contents);

    return new Response(new Blob([body]), {
      headers: {
        "content-type": asset.contentType,
        "cache-control": "no-store",
      },
    });
  }

  if (request.method === "POST") {
    const authError = authorizeApiRequest(request, apiToken);
    if (authError) {
      return json({ error: authError }, noStoreHeaders, 403);
    }

    try {
      switch (url.pathname) {
        case "/api/session/open":
          return json(
            await bridge.callTool("session_open", openSchema.parse(await readJson(request))),
            noStoreHeaders,
          );
        case "/api/session/write":
          return json(
            await bridge.callTool("session_write", writeSchema.parse(await readJson(request))),
            noStoreHeaders,
          );
        case "/api/session/resize":
          return json(
            await bridge.callTool("session_resize", resizeSchema.parse(await readJson(request))),
            noStoreHeaders,
          );
        case "/api/session/signal":
          return json(
            await bridge.callTool("session_signal", signalSchema.parse(await readJson(request))),
            noStoreHeaders,
          );
        case "/api/session/poll":
          return json(
            await bridge.callTool("session_poll", pollSchema.parse(await readJson(request))),
            noStoreHeaders,
          );
        case "/api/session/close":
          return json(
            await bridge.callTool("session_close", closeSchema.parse(await readJson(request))),
            noStoreHeaders,
          );
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return json({ error: error.issues[0]?.message ?? "Invalid request body" }, noStoreHeaders, 400);
      }

      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, noStoreHeaders, 500);
    }
  }

  return new Response("Not found", { status: 404 });
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text.length > 0 ? JSON.parse(text) : {};
}

function json(value: unknown, headers: HeadersInit, status = 200): Response {
  return Response.json(value, {
    status,
    headers,
  });
}

async function buildBrowserAssets(): Promise<BundledAssets> {
  const prebuilt = await readPrebuiltBrowserAssets();
  if (prebuilt) {
    return prebuilt;
  }

  const entrypoint = path.join(process.cwd(), "src", "browser", "app.ts");
  const build = await Bun.build({
    entrypoints: [entrypoint],
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    sourcemap: "none",
    naming: "[name].[ext]",
  });

  if (!build.success) {
    const messages = build.logs.map((log) => log.message).join("\n");
    throw new Error(`Failed to bundle browser UI:\n${messages}`);
  }

  const byPath = new Map<string, BundledAsset>();
  let scriptPath = "";
  const stylesheetPaths: string[] = [];

  for (const output of build.outputs) {
    const basename = path.basename(output.path);
    const routePath = `/assets/${basename}`;
    const contents = new Uint8Array(await output.arrayBuffer());
    const contentType = mimeTypeForPath(routePath);

    byPath.set(routePath, { contents, contentType });

    if (routePath.endsWith(".js")) {
      scriptPath = routePath;
    } else if (routePath.endsWith(".css")) {
      stylesheetPaths.push(routePath);
    }
  }

  if (!scriptPath) {
    throw new Error("Browser UI bundle did not emit a JavaScript asset");
  }

  return {
    scriptPath,
    stylesheetPaths,
    byPath,
  };
}

async function readPrebuiltBrowserAssets(): Promise<BundledAssets | null> {
  const prebuiltDir = path.join(process.cwd(), "dist", "browser");
  const scriptCandidate = path.join(prebuiltDir, "app.js");
  if (!(await Bun.file(scriptCandidate).exists())) {
    return null;
  }

  const byPath = new Map<string, BundledAsset>();
  const scriptPath = "/assets/app.js";
  const stylesheetPaths: string[] = [];

  const scriptContents = new Uint8Array(await readFile(scriptCandidate));
  byPath.set(scriptPath, {
    contents: scriptContents,
    contentType: mimeTypeForPath(scriptPath),
  });

  const stylesheetCandidate = path.join(prebuiltDir, "app.css");
  if (await Bun.file(stylesheetCandidate).exists()) {
    const stylesheetPath = "/assets/app.css";
    stylesheetPaths.push(stylesheetPath);
    byPath.set(stylesheetPath, {
      contents: new Uint8Array(await readFile(stylesheetCandidate)),
      contentType: mimeTypeForPath(stylesheetPath),
    });
  }

  return {
    scriptPath,
    stylesheetPaths,
    byPath,
  };
}

function renderHtml(
  assets: BundledAssets,
  options: BrowserServerOptions,
  apiToken: string,
): string {
  const stylesheetLinks = assets.stylesheetPaths
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>csh browser terminal</title>
    ${stylesheetLinks}
  </head>
  <body>
    <main class="shell-app">
      <section class="topbar">
        <div class="title">
          <span class="eyebrow">Interactive</span>
          <h1>Browser Terminal UI</h1>
          <p>${options.description}</p>
        </div>
        <div class="actions">
          <button class="button button-accent" type="button" data-action="reconnect">Reconnect</button>
          <button class="button" type="button" data-action="interrupt">Interrupt</button>
          <button class="button button-danger" type="button" data-action="close">Close</button>
        </div>
      </section>
      <section class="statusbar">
        <div>status: <strong data-status>Booting browser terminal...</strong></div>
        <div class="status-meta">mode: <span>${options.modeLabel}</span> | session: <span data-session>pending</span></div>
      </section>
      <section class="terminal-card">
        <div class="terminal-shell" data-terminal></div>
      </section>
    </main>
    <script>
      window.__CSH_BROWSER_CONFIG__ = ${JSON.stringify({
        apiToken,
        stateNamespace: options.stateNamespace,
      })};
    </script>
    <script type="module" src="${assets.scriptPath}"></script>
  </body>
</html>`;
}

function mimeTypeForPath(pathname: string): string {
  if (pathname.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  return "application/octet-stream";
}

function authorizeApiRequest(request: Request, expectedToken: string): string | null {
  const providedToken = request.headers.get("x-csh-browser-token");
  if (providedToken !== expectedToken) {
    return "Missing or invalid browser API token";
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const requestOrigin = new URL(request.url).origin;
    if (origin !== requestOrigin) {
      return "Cross-origin browser API request rejected";
    }
  }

  return null;
}

function resolveBrowserAuth(env: z.infer<typeof envSchema>): BrowserAuth | null {
  const username = env.CSH_BROWSER_AUTH_USER?.trim() ?? "";
  const password = env.CSH_BROWSER_AUTH_PASSWORD?.trim() ?? "";
  if (!env.CSH_BROWSER_ALLOW_REMOTE && !username && !password) {
    return {
      username: "csh",
      password: randomUUID(),
      generated: true,
    };
  }
  if (!username || !password) {
    throw new Error(
      "Remote browser mode requires CSH_BROWSER_AUTH_USER and CSH_BROWSER_AUTH_PASSWORD",
    );
  }
  return { username, password, generated: false };
}

function authorizeBrowserRequest(request: Request, auth: BrowserAuth | null): string | null {
  if (!auth) {
    return null;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return "Browser authentication required";
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return "Browser authentication required";
  }

  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  if (username !== auth.username || password !== auth.password) {
    return "Browser authentication required";
  }

  return null;
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
