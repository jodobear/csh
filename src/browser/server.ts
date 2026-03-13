import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

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

const env = envSchema.parse(process.env);
const assets = await buildBrowserAssets();
const shellBridge = await createShellBridge();
const noStoreHeaders = {
  "cache-control": "no-store",
};

const server = Bun.serve({
  hostname: env.CSH_BROWSER_HOST,
  port: env.CSH_BROWSER_PORT,
  idleTimeout: 30,
  fetch: (request) => handleRequest(request, shellBridge, assets),
  error(error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  },
});

console.error(`csh browser UI listening on http://${server.hostname}:${server.port}`);

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

async function handleRequest(
  request: Request,
  bridge: ShellBridge,
  bundledAssets: BundledAssets,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(renderHtml(bundledAssets), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...noStoreHeaders,
      },
    });
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    return json({ ok: true });
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
          return json(await bridge.callTool("session_open", openSchema.parse(await readJson(request))));
        case "/api/session/write":
          return json(await bridge.callTool("session_write", writeSchema.parse(await readJson(request))));
        case "/api/session/resize":
          return json(await bridge.callTool("session_resize", resizeSchema.parse(await readJson(request))));
        case "/api/session/signal":
          return json(await bridge.callTool("session_signal", signalSchema.parse(await readJson(request))));
        case "/api/session/poll":
          return json(await bridge.callTool("session_poll", pollSchema.parse(await readJson(request))));
        case "/api/session/close":
          return json(await bridge.callTool("session_close", closeSchema.parse(await readJson(request))));
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return json({ error: error.issues[0]?.message ?? "Invalid request body" }, 400);
      }

      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }
  }

  return new Response("Not found", { status: 404 });
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text.length > 0 ? JSON.parse(text) : {};
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: noStoreHeaders,
  });
}

type ShellBridge = {
  callTool<T>(name: string, args: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
};

async function createShellBridge(): Promise<ShellBridge> {
  const client = new Client({
    name: "csh-browser-shell-bridge",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["run", "src/main.ts"],
    cwd: process.cwd(),
    stderr: "inherit",
  });

  await client.connect(transport);

  let rpcChain = Promise.resolve();

  return {
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return queueRpc<T>(async () => {
        const result = await client.callTool({
          name,
          arguments: args,
        });

        return parseToolResult<T>(result);
      });
    },
    async close(): Promise<void> {
      await client.close();
    },
  };

  function queueRpc<T>(operation: () => Promise<T>): Promise<T> {
    const next = rpcChain.then(operation, operation);
    rpcChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

type BundledAsset = {
  contents: Uint8Array;
  contentType: string;
};

type BundledAssets = {
  scriptPath: string;
  stylesheetPaths: string[];
  byPath: Map<string, BundledAsset>;
};

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

function renderHtml(assets: BundledAssets): string {
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
          <span class="eyebrow">Phase 3.1</span>
          <h1>Browser Terminal UI</h1>
          <p>Local browser shell loop against the stable csh session contract.</p>
        </div>
        <div class="actions">
          <button class="button button-accent" type="button" data-action="reconnect">Reconnect</button>
          <button class="button" type="button" data-action="interrupt">Interrupt</button>
          <button class="button button-danger" type="button" data-action="close">Close</button>
        </div>
      </section>
      <section class="statusbar">
        <div>status: <strong data-status>Booting browser terminal...</strong></div>
        <div class="status-meta">session: <span data-session>pending</span></div>
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

function parseToolResult<T>(result: unknown): T {
  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result &&
    result.structuredContent
  ) {
    return result.structuredContent as T;
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "isError" in result &&
    result.isError === true
  ) {
    throw new Error(`Tool call failed: ${extractTextContent(result)}`);
  }

  const textContent = extractTextContent(result);
  if (textContent) {
    try {
      return JSON.parse(textContent) as T;
    } catch (error) {
      throw new Error(
        `Expected structuredContent or JSON text in tool result; received text: ${textContent}`,
        { cause: error },
      );
    }
  }

  throw new Error("Expected structuredContent or JSON text in tool result");
}

function extractTextContent(result: unknown): string | undefined {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return undefined;
  }

  const textPart = result.content.find((item) =>
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "text" &&
    "text" in item &&
    typeof item.text === "string"
  );

  return textPart?.text;
}

async function shutdown(exitCode: number): Promise<never> {
  server.stop(true);
  await shellBridge.close();
  process.exit(exitCode);
}
