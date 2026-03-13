import path from "node:path";
import { z } from "zod";
import type { ShellBridge } from "./shell-bridge.js";

const envSchema = z.object({
  CSH_BROWSER_HOST: z.string().trim().min(1).default("127.0.0.1"),
  CSH_BROWSER_PORT: z.coerce.number().int().min(1).max(65535).default(4318),
});

const openSchema = z.object({
  command: z.string().optional(),
  cwd: z.string().optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  ownerId: z.string().min(1),
});

const writeSchema = z.object({
  sessionId: z.string().min(1),
  input: z.string(),
  ownerId: z.string().min(1),
});

const resizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  ownerId: z.string().min(1),
});

const signalSchema = z.object({
  sessionId: z.string().min(1),
  signal: z.enum(["SIGINT", "SIGTERM", "SIGHUP"]),
  ownerId: z.string().min(1),
});

const pollSchema = z.object({
  sessionId: z.string().min(1),
  cursor: z.number().int().min(0).optional(),
  ownerId: z.string().min(1),
});

const closeSchema = z.object({
  sessionId: z.string().min(1),
  ownerId: z.string().min(1),
});

type BrowserServerOptions = {
  createShellBridge: () => Promise<ShellBridge>;
  modeLabel: string;
  description: string;
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

export async function startBrowserServer(options: BrowserServerOptions): Promise<void> {
  const env = envSchema.parse(process.env);
  const assets = await buildBrowserAssets();
  const shellBridge = await options.createShellBridge();
  const noStoreHeaders = {
    "cache-control": "no-store",
  };

  const server = Bun.serve({
    hostname: env.CSH_BROWSER_HOST,
    port: env.CSH_BROWSER_PORT,
    idleTimeout: 30,
    fetch: (request) => handleRequest(request, shellBridge, assets, noStoreHeaders, options),
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
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(renderHtml(bundledAssets, options), {
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
        "cache-control": "public, max-age=300",
      },
    });
  }

  if (request.method === "POST") {
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

function renderHtml(assets: BundledAssets, options: BrowserServerOptions): string {
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
          <span class="eyebrow">Phase 3.2</span>
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
