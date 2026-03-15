import {
  createDirectClient,
  loadEnvFile,
  openSession,
  waitForSnapshot,
  writeSession,
} from "./client-common";

loadEnvFile();

const client = await createDirectClient("csh-phase1-smoke");

const tools = await client.listTools();
console.log(JSON.stringify({ tools: tools.tools.map((tool) => tool.name) }, null, 2));

const session = await openSession(client);
let cursor = session.cursor;

await writeSession(client, session.sessionId, "printf '__PWD__%s\\n' \"$PWD\"\n");
let result = await waitForSnapshot(
  client,
  session.sessionId,
  (snapshot) => snapshot.includes("__PWD__/"),
  { cursor },
);
cursor = result.cursor;
console.log(JSON.stringify({ command: "pwd", result }, null, 2));

await writeSession(client, session.sessionId, "cd /tmp\nprintf '__PWD__%s\\n' \"$PWD\"\n");
result = await waitForSnapshot(
  client,
  session.sessionId,
  (snapshot) => snapshot.includes("__PWD__/tmp"),
  { cursor },
);
console.log(JSON.stringify({ command: "cd /tmp && pwd", result }, null, 2));

await client.close();
process.exit(0);
