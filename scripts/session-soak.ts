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
const outputLines = Number.parseInt(process.env.CSH_SOAK_OUTPUT_LINES ?? "800", 10);
const sessionId =
  process.env.CSH_SOAK_SESSION_ID ?? `csh-soak-${Date.now()}-${process.pid}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const firstClient = await createDirectClient("csh-soak-a");
const opened = await openSession(firstClient, { sessionId });
await writeSession(firstClient, opened.sessionId, "echo __PID__$$\n");
const firstResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PID__"),
  { cursor: opened.cursor },
);
const firstPid = parsePidFromSnapshot(sessionOutputText(firstResult));
assert(firstPid, "Could not parse initial shell PID");

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

await writeSession(firstClient, opened.sessionId, "echo __KEEPALIVE__$$\n");
const keepAliveResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__KEEPALIVE__"),
  { cursor, timeoutMs: 10_000 },
);
const postKeepAlivePid = parseTaggedPid(sessionOutputText(keepAliveResult), "__KEEPALIVE__");
assert(postKeepAlivePid === firstPid, "Shell PID changed during keepAlive soak");
await firstClient.close();

await sleep(reconnectDelayMs);

const reconnectClient = await createDirectClient("csh-soak-b");
try {
  await writeSession(reconnectClient, opened.sessionId, "echo __RECONNECT__$$\n");
  const reconnectResult = await waitForSnapshot(
    reconnectClient,
    opened.sessionId,
    (snapshot) => snapshot.includes("__RECONNECT__"),
    { cursor: keepAliveResult.cursor, timeoutMs: 15_000 },
  );
  const postReconnectPid = parseTaggedPid(sessionOutputText(reconnectResult), "__RECONNECT__");
  assert(postReconnectPid === firstPid, "Shell PID changed after delayed reconnect");

  await closeSession(reconnectClient, opened.sessionId);

  console.log(
    JSON.stringify(
      {
        sessionId: opened.sessionId,
        outputLines,
        keepAliveDurationMs,
        reconnectDelayMs,
        initialPid: firstPid,
        postKeepAlivePid,
        postReconnectPid,
      },
      null,
      2,
    ),
  );
} finally {
  await reconnectClient.close().catch(() => undefined);
}

process.exit(0);

function parsePidFromSnapshot(snapshot: string | null): number | null {
  if (!snapshot) {
    return null;
  }
  const match = snapshot.match(/__PID__(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseTaggedPid(snapshot: string | null, marker: string): number | null {
  if (!snapshot) {
    return null;
  }
  const match = snapshot.match(new RegExp(`${marker}(\\d+)`));
  return match ? Number(match[1]) : null;
}
