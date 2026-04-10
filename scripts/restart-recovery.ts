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
  waitForLogMarker,
} from "./host-control";
import { parseLatestMarkerInt } from "./session-markers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const envFile = path.resolve(process.argv[2] ?? process.env.CVM_ENV_FILE ?? ".env.csh.local");
process.env.CVM_ENV_FILE = envFile;
loadEnvFile(envFile);

const restartHostPid = parseRequiredInt("CSH_RESTART_HOST_PID");
const replacementHostLog =
  process.env.CSH_RESTART_HOST_LOG ||
  path.join(repoRoot(), ".csh-runtime", "logs", "restart-host.log");
const startupTimeoutMs = Number.parseInt(
  process.env.CSH_RESTART_STARTUP_TIMEOUT_MS ?? "30000",
  10,
);
const reconnectDelayMs = Number.parseInt(
  process.env.CSH_RESTART_RECOVERY_DELAY_MS ?? "500",
  10,
);
const sessionId =
  process.env.CSH_RESTART_RECOVERY_SESSION_ID ??
  `csh-restart-recovery-${Date.now()}-${process.pid}`;

const firstClient = await connectClientWithRetry("csh-restart-a");
const opened = await openSession(firstClient, { sessionId });
await writeSession(
  firstClient,
  opened.sessionId,
  "cd /tmp\nprintf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n",
);
const beforeRestart = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PWD__/tmp") && snapshot.includes("__PID__"),
  { cursor: opened.cursor },
);
const initialPid = parsePidFromSnapshot(sessionOutputText(beforeRestart));
assert(initialPid, "Could not parse initial shell PID before restart");
await ignoreCleanupTimeout(() => firstClient.close());

await terminateProcess(restartHostPid);

const replacementHost = await startLoggedProcess(
  "bash",
  ["scripts/start-host.sh", envFile],
  replacementHostLog,
  {
    cwd: repoRoot(),
    detached: true,
  },
);
console.log(`replacement_host_pid=${replacementHost.pid}`);

await waitForLogMarker(
  replacementHostLog,
  "csh ContextVM gateway started",
  replacementHost.pid,
  startupTimeoutMs,
);
await sleep(reconnectDelayMs);

const reconnectClient = await connectClientWithRetry("csh-restart-b");

try {
  await writeSession(
    reconnectClient,
    opened.sessionId,
    "printf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n",
  );
  const afterRestart = await waitForSnapshot(
    reconnectClient,
    opened.sessionId,
    (snapshot) => snapshot.includes("__PWD__/tmp") && snapshot.includes("__PID__"),
    { cursor: beforeRestart.cursor, timeoutMs: 15_000 },
  );
  const postRestartPid = parsePidFromSnapshot(sessionOutputText(afterRestart));

  assert(postRestartPid, "Could not parse shell PID after restart");
  assert(
    postRestartPid === initialPid,
    `Shell PID changed across relay-backed host restart (initial=${initialPid}, postRestart=${postRestartPid})`,
  );

  await ignoreCleanupTimeout(() => closeSession(reconnectClient, opened.sessionId));

  const freshSession = await openSession(reconnectClient);
  await writeSession(reconnectClient, freshSession.sessionId, "echo __FRESH__$$\n");
  const freshResult = await waitForSnapshot(
    reconnectClient,
    freshSession.sessionId,
    (snapshot) => snapshot.includes("__FRESH__"),
    { cursor: freshSession.cursor, timeoutMs: 10_000 },
  );
  const freshPid = parseFreshPid(sessionOutputText(freshResult));

  assert(freshPid, "Could not open a fresh session after host restart");

  await ignoreCleanupTimeout(() => closeSession(reconnectClient, freshSession.sessionId));

  console.log(
    JSON.stringify(
      {
        sessionId: opened.sessionId,
        initialPid,
        postRestartPid,
        freshPid,
        replacementHostPid: replacementHost.pid,
        replacementHostLog,
      },
      null,
      2,
    ),
  );
} finally {
  await ignoreCleanupTimeout(() => reconnectClient.close());
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

function parsePidFromSnapshot(snapshot: string | null): number | null {
  return parseLatestMarkerInt(snapshot, "__PID__");
}

function parseFreshPid(snapshot: string | null): number | null {
  return parseLatestMarkerInt(snapshot, "__FRESH__");
}
