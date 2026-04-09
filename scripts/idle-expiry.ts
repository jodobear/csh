#!/usr/bin/env bun
import {
  createDirectClient,
  loadEnvFile,
  openSession,
  pollSession,
  sessionOutputText,
  sleep,
  waitForSnapshot,
  writeSession,
} from "./client-common";

loadEnvFile();

const idleTtlMs = Number.parseInt(process.env.CSH_IDLE_EXPIRY_TTL_MS ?? "2000", 10);
const scavengeIntervalMs = Number.parseInt(process.env.CSH_IDLE_EXPIRY_SCAVENGE_MS ?? "1000", 10);
const settleMs = Number.parseInt(process.env.CSH_IDLE_EXPIRY_SETTLE_MS ?? "2500", 10);
const sessionId =
  process.env.CSH_IDLE_EXPIRY_SESSION_ID ?? `csh-idle-expiry-${Date.now()}-${process.pid}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const client = await createDirectClient("csh-idle-expiry");

try {
  const opened = await openSession(client, { sessionId });
  await writeSession(client, opened.sessionId, "echo __IDLE__$$\n");
  const firstResult = await waitForSnapshot(
    client,
    opened.sessionId,
    (snapshot) => snapshot.includes("__IDLE__"),
    { cursor: opened.cursor },
  );
  const initialPid = parseTaggedPid(sessionOutputText(firstResult), "__IDLE__");
  assert(initialPid, "Could not parse initial PID before idle expiry");

  await sleep(idleTtlMs + scavengeIntervalMs + settleMs);

  const expired = await waitForClosedPoll(
    client,
    opened.sessionId,
    firstResult.cursor,
    15_000,
  );

  assert(expired.closedAt, "Idle session did not report closedAt after TTL expiry");

  const freshSession = await openSession(client);
  await writeSession(client, freshSession.sessionId, "echo __FRESH__$$\n");
  const freshResult = await waitForSnapshot(
    client,
    freshSession.sessionId,
    (snapshot) => snapshot.includes("__FRESH__"),
    { cursor: freshSession.cursor, timeoutMs: 10_000 },
  );
  const freshPid = parseTaggedPid(sessionOutputText(freshResult), "__FRESH__");
  assert(freshPid, "Could not open a fresh session after idle expiry");

  console.log(
    JSON.stringify(
      {
        sessionId: opened.sessionId,
        idleTtlMs,
        scavengeIntervalMs,
        settleMs,
        initialPid,
        closedAt: expired.closedAt,
        freshPid,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close().catch(() => undefined);
}

process.exit(0);

async function waitForClosedPoll(
  client: Awaited<ReturnType<typeof createDirectClient>>,
  sessionId: string,
  initialCursor: number,
  timeoutMs: number,
) {
  const startedAt = Date.now();
  let cursor = initialCursor;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await pollSession(client, sessionId, cursor, false);
    cursor = result.cursor;
    if (result.closedAt) {
      return result;
    }
    await sleep(100);
  }

  throw new Error(`Timed out waiting for idle expiry on ${sessionId}`);
}

function parseTaggedPid(snapshot: string | null, marker: string): number | null {
  if (!snapshot) {
    return null;
  }
  const match = snapshot.match(new RegExp(`${marker}(\\d+)`));
  return match ? Number(match[1]) : null;
}
