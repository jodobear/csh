#!/usr/bin/env bun
import {
  closeSession,
  createDirectClient,
  loadEnvFile,
  openSession,
  sessionOutputText,
  sleep,
  waitForSnapshot,
  writeSession,
} from "./client-common";

type BrowserRuntimeConfig = {
  apiToken: string;
};

type SessionPollResult = {
  sessionId: string;
  changed: boolean;
  cursor: number;
  snapshot: string | null;
  snapshotBase64?: string | null;
  delta?: string | null;
  deltaBase64?: string | null;
  cols: number;
  rows: number;
  closedAt: string | null;
  exitStatus: number | null;
};

loadEnvFile();

const browserHost = process.env.CSH_BROWSER_HOST || "127.0.0.1";
const browserPort = process.env.CSH_BROWSER_PORT || "4318";
const browserAuthUser = process.env.CSH_BROWSER_AUTH_USER || "csh";
const browserAuthPassword = process.env.CSH_BROWSER_AUTH_PASSWORD;
const ageMs = Number.parseInt(process.env.CSH_AGED_BROWSER_ATTACH_MS ?? "6000", 10);
const sessionId =
  process.env.CSH_AGED_BROWSER_SESSION_ID ?? `csh-aged-browser-${Date.now()}-${process.pid}`;

if (!browserAuthPassword) {
  throw new Error("Missing CSH_BROWSER_AUTH_PASSWORD for aged browser attach");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const baseUrl = `http://${browserHost}:${browserPort}`;
const authHeader = `Basic ${Buffer.from(`${browserAuthUser}:${browserAuthPassword}`, "utf8").toString("base64")}`;
const authHeaders = {
  authorization: authHeader,
};

const directClient = await createDirectClient("csh-aged-browser");

try {
  const opened = await openSession(directClient, { sessionId });
  await writeSession(directClient, opened.sessionId, "cd /tmp\nprintf '__AGE__%s\\n' \"$PWD\"\n");
  const firstResult = await waitForSnapshot(
    directClient,
    opened.sessionId,
    (snapshot) => snapshot.includes("__AGE__/tmp"),
    { cursor: opened.cursor },
  );

  const health = await fetch(`${baseUrl}/healthz`, {
    headers: authHeaders,
  });
  if (!health.ok) {
    throw new Error(`Browser health check failed with status ${health.status}`);
  }

  const rootResponse = await fetch(`${baseUrl}/`, {
    headers: authHeaders,
  });
  if (!rootResponse.ok) {
    throw new Error(`Browser root fetch failed with status ${rootResponse.status}`);
  }

  const runtimeConfig = parseRuntimeConfig(await rootResponse.text());
  const apiHeaders = {
    ...authHeaders,
    "content-type": "application/json",
    "x-csh-browser-token": runtimeConfig.apiToken,
  };

  await sleep(ageMs);

  await postJson("/api/session/write", apiHeaders, {
    sessionId: opened.sessionId,
    inputBase64: Buffer.from("printf '__BROWSER_ATTACH__%s\\n' \"$PWD\"\n", "utf8").toString("base64"),
  });

  const browserPoll = await waitForBrowserPoll(
    opened.sessionId,
    firstResult.cursor,
    (result) => sessionOutputTextFromBrowser(result)?.includes("__BROWSER_ATTACH__/tmp") === true,
    apiHeaders,
    15_000,
  );

  const output = sessionOutputTextFromBrowser(browserPoll) ?? "";
  assert(output.includes("__BROWSER_ATTACH__/tmp"), "Browser did not attach to the aged session");

  await postJson("/api/session/close", apiHeaders, {
    sessionId: opened.sessionId,
  });

  console.log(
    JSON.stringify(
      {
        browserUrl: baseUrl,
        sessionId: opened.sessionId,
        ageMs,
        output,
      },
      null,
      2,
    ),
  );
} finally {
  await closeSession(directClient, sessionId).catch(() => undefined);
  await directClient.close().catch(() => undefined);
}

process.exit(0);

async function postJson<T>(
  route: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(payload.error)
        : `Request failed with status ${response.status}`,
    );
  }
  return payload as T;
}

async function waitForBrowserPoll(
  sessionId: string,
  initialCursor: number,
  predicate: (result: SessionPollResult) => boolean,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<SessionPollResult> {
  const startedAt = Date.now();
  let cursor = initialCursor;
  let last: SessionPollResult | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await postJson<SessionPollResult>("/api/session/poll", headers, {
      sessionId,
      cursor,
      keepAlive: true,
    });
    cursor = result.cursor;
    last = result;

    if (predicate(result)) {
      return result;
    }

    await sleep(60);
  }

  throw new Error(`Timed out waiting for browser attach on ${sessionId}: ${JSON.stringify(last, null, 2)}`);
}

function parseRuntimeConfig(html: string): BrowserRuntimeConfig {
  const match = html.match(/window\.__CSH_BROWSER_CONFIG__ = (\{[\s\S]*?\});/);
  if (!match) {
    throw new Error("Browser root did not include runtime config");
  }
  return JSON.parse(match[1]) as BrowserRuntimeConfig;
}

function sessionOutputTextFromBrowser(result: SessionPollResult): string | null {
  if (result.snapshotBase64) {
    return Buffer.from(result.snapshotBase64, "base64").toString("utf8");
  }
  if (result.deltaBase64) {
    return Buffer.from(result.deltaBase64, "base64").toString("utf8");
  }
  return result.snapshot ?? result.delta ?? null;
}
