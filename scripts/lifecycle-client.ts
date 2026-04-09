import {
  closeSession,
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

const reconnectDelayMs = Number(process.env.CVM_RECONNECT_DELAY_MS || "2000");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const firstClient = await createDirectClient("csh-lifecycle-a");
const opened = await openSession(firstClient);
await writeSession(firstClient, opened.sessionId, "printf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n");
const firstResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PWD__/") && snapshot.includes("__PID__"),
  { cursor: opened.cursor },
);
const firstPid = parsePidFromSnapshot(sessionOutputText(firstResult));
assert(firstPid, "Could not parse initial shell PID");

await writeSession(firstClient, opened.sessionId, "cd /tmp\nprintf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n");
const secondResult = await waitForSnapshot(
  firstClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PWD__/tmp") && snapshot.includes("__PID__"),
  { cursor: firstResult.cursor },
);
assert(parsePidFromSnapshot(sessionOutputText(secondResult)) === firstPid, "PID changed during the initial session");

await firstClient.close();

await sleep(reconnectDelayMs);

const reconnectClient = await createDirectClient("csh-lifecycle-b");
await writeSession(
  reconnectClient,
  opened.sessionId,
  "printf '__PWD__%s\\n' \"$PWD\"\necho __PID__$$\n",
);
const reconnectResult = await waitForSnapshot(
  reconnectClient,
  opened.sessionId,
  (snapshot) => snapshot.includes("__PWD__/tmp") && snapshot.includes("__PID__"),
  { cursor: secondResult.cursor },
);
assert(parsePidFromSnapshot(sessionOutputText(reconnectResult)) === firstPid, "PID changed across reconnect");

await closeSession(reconnectClient, opened.sessionId);
const closedPoll = await pollSession(reconnectClient, opened.sessionId, reconnectResult.cursor);
assert(Boolean(closedPoll.closedAt), "Closed session did not report closedAt");

const reopened = await openSession(reconnectClient);
await writeSession(reconnectClient, reopened.sessionId, "echo __PID__$$\n");
const freshResult = await waitForSnapshot(
  reconnectClient,
  reopened.sessionId,
  (snapshot) => snapshot.includes("__PID__"),
  { cursor: reopened.cursor },
);
const freshPid = parsePidFromSnapshot(sessionOutputText(freshResult));
assert(freshPid && freshPid !== firstPid, "Session close did not force a new shell PID");
await reconnectClient.close();

console.log(
  JSON.stringify(
    {
      sessionId: opened.sessionId,
      reconnectDelayMs,
      initialPid: firstPid,
      postReconnectPid: parsePidFromSnapshot(sessionOutputText(reconnectResult)),
      postClosePid: freshPid,
    },
    null,
    2,
  ),
);
process.exit(0);

function parsePidFromSnapshot(snapshot: string | null): number | null {
  if (!snapshot) {
    return null;
  }
  const match = snapshot.match(/__PID__(\d+)/);
  return match ? Number(match[1]) : null;
}
