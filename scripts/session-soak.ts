#!/usr/bin/env bun
import {
  closeSession,
  createDirectClient,
  loadEnvFile,
  pollSession,
  openSession,
  sessionOutputText,
  sleep,
  waitForSnapshot,
  writeSession,
} from "./client-common";

loadEnvFile();

const reconnectDelayMs = Number.parseInt(process.env.CSH_SOAK_RECONNECT_DELAY_MS ?? "6000", 10);
const keepAliveDurationMs = Number.parseInt(process.env.CSH_SOAK_KEEPALIVE_DURATION_MS ?? "6000", 10);
const keepAlivePollMs = Number.parseInt(process.env.CSH_SOAK_KEEPALIVE_POLL_MS ?? "1200", 10);
const outputLines = Number.parseInt(process.env.CSH_SOAK_OUTPUT_LINES ?? "300", 10);
const sessionId =
  process.env.CSH_SOAK_SESSION_ID ?? `csh-soak-${Date.now()}-${process.pid}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const firstClient = await createDirectClient("csh-soak-a");
const opened = await openSession(firstClient, { sessionId });
await writeSession(firstClient, opened.sessionId, "cd /tmp\nprintf '__PWD__%s\\n' \"$PWD\"\n");
const firstResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PWD__/tmp"),
  { cursor: opened.cursor },
);
assert(
  sessionOutputText(firstResult)?.includes("__PWD__/tmp"),
  "Could not establish initial session state for soak proof",
);

await writeSession(
  firstClient,
  opened.sessionId,
  `i=0\nwhile [ "$i" -lt ${outputLines} ]; do printf '__SOAK__%04d\\n' "$i"; i=$((i + 1)); done\nprintf '__SOAK_DONE__\\n'\n`,
);
const highOutputResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => (
    snapshot.includes("__SOAK_DONE__") &&
    snapshot.includes(`__SOAK__${String(outputLines - 1).padStart(4, "0")}`)
  ),
  { cursor: firstResult.cursor, timeoutMs: 20_000 },
);
assert(
  sessionOutputText(highOutputResult)?.includes("__SOAK_DONE__"),
  "High-output command did not reach completion",
);

let cursor = highOutputResult.cursor;
const keepAliveDeadline = Date.now() + keepAliveDurationMs;
while (Date.now() < keepAliveDeadline) {
  const poll = await pollSession(firstClient, opened.sessionId, cursor, true);
  cursor = poll.cursor;
  await sleep(keepAlivePollMs);
}

await writeSession(firstClient, opened.sessionId, "printf '__KEEPALIVE__%s\\n' \"$PWD\"\n");
const keepAliveResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__KEEPALIVE__"),
  { cursor, timeoutMs: 10_000 },
);
assert(
  sessionOutputText(keepAliveResult)?.includes("__KEEPALIVE__/tmp"),
  "Session state changed during keepAlive soak",
);

await sleep(reconnectDelayMs);

const reconnectClient = await createDirectClient("csh-soak-b");
try {
  await writeSession(reconnectClient, opened.sessionId, "printf '__RECONNECT__%s\\n' \"$PWD\"\n");
  const reconnectResult = await waitForSnapshot(
    reconnectClient,
    opened.sessionId,
    (snapshot) => snapshot.includes("__RECONNECT__"),
    { cursor: keepAliveResult.cursor, timeoutMs: 15_000 },
  );
  const reconnectText = sessionOutputText(reconnectResult) ?? "";
  assert(reconnectText.includes("__RECONNECT__/tmp"), "Session state changed after delayed reconnect");
  const reconnectSnapshot = await pollSession(reconnectClient, opened.sessionId);
  assert(
    sessionOutputText(reconnectSnapshot)?.includes("__SOAK_DONE__"),
    "Scrollback did not survive delayed reconnect",
  );

  await ignoreCleanupTimeout(() => closeSession(reconnectClient, opened.sessionId));

  console.log(
    JSON.stringify(
      {
        sessionId: opened.sessionId,
        outputLines,
        keepAliveDurationMs,
        reconnectDelayMs,
        initialState: "/tmp",
        postKeepAliveState: "/tmp",
        postReconnectState: "/tmp",
      },
      null,
      2,
    ),
  );
} finally {
  await ignoreCleanupTimeout(() => reconnectClient.close());
  await ignoreCleanupTimeout(() => firstClient.close());
}

process.exit(0);

async function ignoreCleanupTimeout(operation: () => Promise<unknown>, timeoutMs = 5_000): Promise<void> {
  try {
    await Promise.race([
      operation(),
      Bun.sleep(timeoutMs).then(() => {
        throw new Error(`cleanup timed out after ${timeoutMs}ms`);
      }),
    ]);
  } catch {
    // Cleanup should not mask the proof result.
  }
}
