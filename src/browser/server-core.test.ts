import { describe, expect, test } from "bun:test";
import { handleRequest } from "./server-core.js";

describe("browser server contract", () => {
  const authUser = "fixture-user";
  const authPassword = "fixture-pass";
  const apiToken = "fixture-token";
  const assets = {
    scriptPath: "/assets/app.js",
    stylesheetPaths: [] as string[],
    byPath: new Map([
      [
        "/assets/app.js",
        {
          contents: new TextEncoder().encode("console.log('fixture');"),
          contentType: "application/javascript; charset=utf-8",
        },
      ],
    ]),
  };
  const noStoreHeaders = {
    "cache-control": "no-store",
  };
  const options = {
    createShellBridge: async () => bridge,
    modeLabel: "fixture",
    description: "Fixture browser shell bridge.",
    stateNamespace: "fixture:test",
  };

  let cursor = 1;
  let closedAt: string | null = null;
  let rows = 24;
  let cols = 80;
  let snapshot = "__BROWSER__/fixture\n";

  const bridge = {
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      switch (name) {
        case "session_open":
          return {
            sessionId: "fixture-session",
            cursor,
            cols,
            rows,
            ownerId: "fixture-owner",
            command: "/bin/sh",
          } as T;
        case "session_write":
          if (typeof args.input === "string" && args.input.length > 0) {
            snapshot += args.input;
            cursor += 1;
          }
          if (typeof args.inputBase64 === "string" && args.inputBase64.length > 0) {
            snapshot += Buffer.from(args.inputBase64, "base64").toString("utf8");
            cursor += 1;
          }
          return {
            sessionId: "fixture-session",
            acceptedBytes:
              typeof args.inputBase64 === "string"
                ? Buffer.from(args.inputBase64, "base64").length
                : typeof args.input === "string"
                  ? Buffer.byteLength(args.input, "utf8")
                  : 0,
            lastActivityAt: new Date().toISOString(),
          } as T;
        case "session_resize":
          cols = Number(args.cols);
          rows = Number(args.rows);
          cursor += 1;
          return {
            sessionId: "fixture-session",
            cols,
            rows,
          } as T;
        case "session_signal":
          return {
            sessionId: "fixture-session",
            signal: args.signal,
            lastActivityAt: new Date().toISOString(),
          } as T;
        case "session_poll":
          return {
            sessionId: "fixture-session",
            changed: true,
            cursor,
            snapshot: null,
            snapshotBase64: Buffer.from(snapshot, "utf8").toString("base64"),
            delta: null,
            deltaBase64: null,
            cols,
            rows,
            closedAt,
            exitStatus: closedAt ? 0 : null,
          } as T;
        case "session_close":
          closedAt = new Date().toISOString();
          return {
            sessionId: "fixture-session",
            closedAt,
            exitStatus: 0,
          } as T;
        default:
          throw new Error(`Unsupported fixture tool: ${name}`);
      }
    },
    async close(): Promise<void> {},
  };

  const browserAuth = {
    username: authUser,
    password: authPassword,
    generated: false,
  };

  test("requires browser auth before serving routes", async () => {
    const response = await handleRequest(
      new Request("http://csh.test/"),
      bridge,
      assets,
      noStoreHeaders,
      options,
      apiToken,
      browserAuth,
      10_000,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
  });

  test("serves healthz when browser auth is correct", async () => {
    const response = await handleRequest(
      new Request("http://csh.test/healthz", {
        headers: {
          authorization: basicAuth(authUser, authPassword),
        },
      }),
      bridge,
      assets,
      noStoreHeaders,
      options,
      apiToken,
      browserAuth,
      10_000,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      mode: "fixture",
    });
  });

  test("rejects POST API calls without the browser API token", async () => {
    const response = await handleRequest(
      new Request("http://csh.test/api/session/open", {
        method: "POST",
        headers: {
          authorization: basicAuth(authUser, authPassword),
          "content-type": "application/json",
        },
        body: JSON.stringify({ cols: 80, rows: 24 }),
      }),
      bridge,
      assets,
      noStoreHeaders,
      options,
      apiToken,
      browserAuth,
      10_000,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Missing or invalid browser API token",
    });
  });

  test("forwards authenticated API calls to the shell bridge", async () => {
    const openResponse = await handleRequest(
      new Request("http://csh.test/api/session/open", {
        method: "POST",
        headers: {
          authorization: basicAuth(authUser, authPassword),
          "content-type": "application/json",
          "x-csh-browser-token": apiToken,
        },
        body: JSON.stringify({ cols: 80, rows: 24 }),
      }),
      bridge,
      assets,
      noStoreHeaders,
      options,
      apiToken,
      browserAuth,
      10_000,
    );

    expect(openResponse.status).toBe(200);
    const opened = await openResponse.json();
    expect(opened.sessionId).toBe("fixture-session");

    const pollResponse = await handleRequest(
      new Request("http://csh.test/api/session/poll", {
        method: "POST",
        headers: {
          authorization: basicAuth(authUser, authPassword),
          "content-type": "application/json",
          "x-csh-browser-token": apiToken,
        },
        body: JSON.stringify({ sessionId: "fixture-session", cursor: opened.cursor }),
      }),
      bridge,
      assets,
      noStoreHeaders,
      options,
      apiToken,
      browserAuth,
      10_000,
    );

    expect(pollResponse.status).toBe(200);
    const poll = await pollResponse.json();
    const body = Buffer.from(poll.snapshotBase64, "base64").toString("utf8");

    expect(body).toContain("__BROWSER__/fixture");
  });

  test("forwards byte-safe browser writes through inputBase64", async () => {
    const writeResponse = await handleRequest(
      new Request("http://csh.test/api/session/write", {
        method: "POST",
        headers: {
          authorization: basicAuth(authUser, authPassword),
          "content-type": "application/json",
          "x-csh-browser-token": apiToken,
        },
        body: JSON.stringify({
          sessionId: "fixture-session",
          inputBase64: Buffer.from("__BYTES__\u0000A", "utf8").toString("base64"),
        }),
      }),
      bridge,
      assets,
      noStoreHeaders,
      options,
      apiToken,
      browserAuth,
      10_000,
    );

    expect(writeResponse.status).toBe(200);
    const written = await writeResponse.json();
    expect(written.acceptedBytes).toBeGreaterThan(0);
  });
});

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}
