import { loadEnvFile } from "./client-common";

type BrowserRuntimeConfig = {
  apiToken: string;
  stateNamespace: string;
  scrollbackLines: number;
};

type SessionOpenResult = {
  sessionId: string;
  cursor: number;
  cols: number;
  rows: number;
  ownerId: string;
  command: string;
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

if (!browserAuthPassword) {
  throw new Error("Missing CSH_BROWSER_AUTH_PASSWORD for browser smoke");
}

const baseUrl = `http://${browserHost}:${browserPort}`;
const authHeader = `Basic ${Buffer.from(`${browserAuthUser}:${browserAuthPassword}`, "utf8").toString("base64")}`;
const authHeaders = {
  authorization: authHeader,
};

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

const byteSession = await postJson<SessionOpenResult>("/api/session/open", apiHeaders, {
  command: "/bin/sh -lc 'stty raw -echo; od -An -tx1 -N4'",
  cols: 80,
  rows: 24,
});

const rawBytes = Uint8Array.from([0x00, 0xff, 0x41, 0x1b]);
await postJson("/api/session/write", apiHeaders, {
  sessionId: byteSession.sessionId,
  inputBase64: Buffer.from(rawBytes).toString("base64"),
});

const bytePoll = await waitForPoll(
  byteSession.sessionId,
  byteSession.cursor,
  (result) => sessionOutputText(result)?.includes("00 ff 41 1b") === true && result.closedAt !== null,
  apiHeaders,
);

if (!sessionOutputText(bytePoll)?.includes("00 ff 41 1b")) {
  throw new Error("Browser byte-safe write did not reach the remote PTY");
}

const shellSession = await postJson<SessionOpenResult>("/api/session/open", apiHeaders, {
  cols: 80,
  rows: 24,
});

let shellClosed = false;

try {
  await postJson("/api/session/write", apiHeaders, {
    sessionId: shellSession.sessionId,
    inputBase64: Buffer.from("printf '__BROWSER__%s\\n' \"$PWD\"\n", "utf8").toString("base64"),
  });

  const shellPoll = await waitForPoll(
    shellSession.sessionId,
    shellSession.cursor,
    (result) => sessionOutputText(result)?.includes("__BROWSER__/") === true,
    apiHeaders,
  );

  const output = sessionOutputText(shellPoll) ?? "";
  if (!output.includes("__BROWSER__/")) {
    throw new Error("Browser shell smoke did not observe expected shell output");
  }

  await postJson("/api/session/close", apiHeaders, {
    sessionId: shellSession.sessionId,
  });
  shellClosed = true;

  const closedPoll = await waitForPoll(
    shellSession.sessionId,
    shellPoll.cursor,
    (result) => result.closedAt !== null,
    apiHeaders,
  );

  if (!closedPoll.closedAt) {
    throw new Error("Browser close path did not report closedAt");
  }

  console.log(
    JSON.stringify(
      {
        browserUrl: baseUrl,
        stateNamespace: runtimeConfig.stateNamespace,
        byteSessionId: byteSession.sessionId,
        shellSessionId: shellSession.sessionId,
        shellOutput: output,
        closeExitStatus: closedPoll.exitStatus,
      },
      null,
      2,
    ),
  );
} finally {
  if (!shellClosed) {
    await closeSessionOverHttp(shellSession.sessionId, apiHeaders).catch(() => undefined);
  }
}

async function postJson<T>(
  path: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
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

async function waitForPoll(
  sessionId: string,
  initialCursor: number,
  predicate: (result: SessionPollResult) => boolean,
  headers: Record<string, string>,
  timeoutMs = 10_000,
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

    await Bun.sleep(60);
  }

  throw new Error(`Timed out waiting for browser poll on ${sessionId}: ${JSON.stringify(last, null, 2)}`);
}

function parseRuntimeConfig(html: string): BrowserRuntimeConfig {
  const match = html.match(/window\.__CSH_BROWSER_CONFIG__ = (\{[\s\S]*?\});/);
  if (!match) {
    throw new Error("Browser root did not include runtime config");
  }

  return JSON.parse(match[1]) as BrowserRuntimeConfig;
}

function sessionOutputText(result: SessionPollResult): string | null {
  if (result.snapshotBase64) {
    return Buffer.from(result.snapshotBase64, "base64").toString("utf8");
  }
  if (result.deltaBase64) {
    return Buffer.from(result.deltaBase64, "base64").toString("utf8");
  }
  return result.snapshot ?? result.delta ?? null;
}

async function closeSessionOverHttp(
  sessionId: string,
  headers: Record<string, string>,
): Promise<void> {
  await postJson("/api/session/close", headers, { sessionId });
}
