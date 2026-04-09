#!/usr/bin/env bun
import path from "node:path";

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
import { repoRoot } from "./config";
import {
  startLoggedProcess,
  terminateProcess,
  waitForTcpListener,
} from "./host-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const envFile = path.resolve(process.argv[2] ?? process.env.CVM_ENV_FILE ?? ".env.csh.local");
process.env.CVM_ENV_FILE = envFile;
loadEnvFile(envFile);

const relayPid = parseRequiredInt("CSH_RELAY_RECOVERY_RELAY_PID");
const relay = parseRequiredLoopbackRelay(process.env.CVM_RELAYS ?? "");
const replacementRelayLog =
  process.env.CSH_RELAY_RECOVERY_RELAY_LOG ||
  path.join(repoRoot(), ".csh-runtime", "logs", "relay-recovery-relay.log");
const startupTimeoutMs = Number.parseInt(
  process.env.CSH_RELAY_RECOVERY_STARTUP_TIMEOUT_MS ?? "30000",
  10,
);
const reconnectDelayMs = Number.parseInt(
  process.env.CSH_RELAY_RECOVERY_DELAY_MS ?? "500",
  10,
);
const sessionId =
  process.env.CSH_RELAY_RECOVERY_SESSION_ID ??
  `csh-relay-recovery-${Date.now()}-${process.pid}`;

const firstClient = await connectClientWithRetry("csh-relay-a");
const opened = await openSession(firstClient, { sessionId });
await writeSession(
  firstClient,
  opened.sessionId,
  "cd /tmp\nprintf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n",
);
const beforeRecovery = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PWD__/tmp") && snapshot.includes("__PID__"),
  { cursor: opened.cursor },
);
const initialPid = parsePidFromSnapshot(sessionOutputText(beforeRecovery));
assert(initialPid, "Could not parse initial shell PID before relay interruption");
await firstClient.close();

await terminateProcess(relayPid);

const replacementRelay = await startLoggedProcess(
  "bash",
  ["scripts/start-test-relay.sh"],
  replacementRelayLog,
  {
    cwd: repoRoot(),
    detached: true,
    env: {
      CSH_TEST_RELAY_HOST: relay.host,
      CSH_TEST_RELAY_PORT: String(relay.port),
    },
  },
);
console.log(`replacement_relay_pid=${replacementRelay.pid}`);

await waitForTcpListener(
  relay.host,
  relay.port,
  replacementRelay.pid,
  startupTimeoutMs,
);
await sleep(reconnectDelayMs);

const reconnectClient = await connectClientWithRetry("csh-relay-b", 20_000);

try {
  await writeSession(
    reconnectClient,
    opened.sessionId,
    "printf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n",
  );
  const afterRecovery = await waitForSnapshot(
    reconnectClient,
    opened.sessionId,
    (snapshot) => snapshot.includes("__PWD__/tmp") && snapshot.includes("__PID__"),
    { cursor: beforeRecovery.cursor, timeoutMs: 15_000 },
  );
  const postRecoveryPid = parsePidFromSnapshot(sessionOutputText(afterRecovery));

  assert(postRecoveryPid, "Could not parse shell PID after relay recovery");
  assert(postRecoveryPid === initialPid, "Shell PID changed across relay interruption");

  await closeSession(reconnectClient, opened.sessionId);

  const freshSession = await openSession(reconnectClient);
  await writeSession(reconnectClient, freshSession.sessionId, "echo __FRESH__$$\n");
  const freshResult = await waitForSnapshot(
    reconnectClient,
    freshSession.sessionId,
    (snapshot) => snapshot.includes("__FRESH__"),
    { cursor: freshSession.cursor, timeoutMs: 10_000 },
  );
  const freshPid = parseFreshPid(sessionOutputText(freshResult));

  assert(freshPid, "Could not open a fresh session after relay recovery");

  await closeSession(reconnectClient, freshSession.sessionId);

  console.log(
    JSON.stringify(
      {
        sessionId: opened.sessionId,
        initialPid,
        postRecoveryPid,
        freshPid,
        replacementRelayPid: replacementRelay.pid,
        replacementRelayLog,
        relayHost: relay.host,
        relayPort: relay.port,
      },
      null,
      2,
    ),
  );
} finally {
  await reconnectClient.close().catch(() => undefined);
}

process.exit(0);

async function connectClientWithRetry(name: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await createDirectClient(name);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out connecting relay-backed client: ${name}`);
}

function parseRequiredInt(name: string): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return parsed;
}

function parseRequiredLoopbackRelay(relays: string): { host: string; port: number } {
  const firstRelay = relays.split(",").map((value) => value.trim()).find(Boolean);
  if (!firstRelay) {
    throw new Error("Missing CVM_RELAYS for relay recovery");
  }

  const url = new URL(firstRelay);
  if (url.protocol !== "ws:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error(`Relay recovery requires a loopback ws relay, got ${firstRelay}`);
  }

  const port = Number.parseInt(url.port || "80", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Relay recovery requires an explicit relay port, got ${firstRelay}`);
  }

  return {
    host: url.hostname,
    port,
  };
}

function parsePidFromSnapshot(snapshot: string | null): number | null {
  if (!snapshot) {
    return null;
  }
  const match = snapshot.match(/__PID__(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseFreshPid(snapshot: string | null): number | null {
  if (!snapshot) {
    return null;
  }
  const match = snapshot.match(/__FRESH__(\d+)/);
  return match ? Number(match[1]) : null;
}
