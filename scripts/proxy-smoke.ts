import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { loadEnvFile } from "./client-common";
import { parseToolResult } from "../src/mcp/tool-result.js";

loadEnvFile();

const envFile = process.env.CVM_ENV_FILE || ".env.phase1.local";
const command = process.env.CVM_PROXY_COMMAND || "scripts/start-proxy.sh";
const args = process.env.CVM_PROXY_ARGS
  ? process.env.CVM_PROXY_ARGS.split(" ").filter(Boolean)
  : [envFile];

const transport = new StdioClientTransport({
  command,
  args,
  cwd: process.cwd(),
  env: process.env as Record<string, string>,
  stderr: "pipe",
});

let stderrBuffer = "";
transport.stderr?.on("data", (chunk) => {
  stderrBuffer += chunk.toString();
});

const client = new Client({
  name: "csh-phase1-proxy-smoke",
  version: "0.1.0",
});

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const openResult = await parseToolResult<{ sessionId: string; cursor: number }>(
    client.callTool({
      name: "session_open",
      arguments: {
        command: "/bin/sh",
        cols: 80,
        rows: 24,
      },
    }),
  );
  await parseToolResult(
    client.callTool({
      name: "session_write",
      arguments: {
        sessionId: openResult.sessionId,
        input: "pwd\n",
      },
    }),
  );
  const result = await parseToolResult<{ cursor: number; snapshot: string | null }>(
    client.callTool({
      name: "session_poll",
      arguments: {
        sessionId: openResult.sessionId,
        cursor: openResult.cursor,
      },
    }),
  );

  console.log(
    JSON.stringify(
      {
        tools: tools.tools.map((tool) => tool.name),
        firstCommand: result.snapshot,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("proxy-cli path failed");
  if (stderrBuffer) {
    console.error(stderrBuffer.trim());
  }
  throw error;
} finally {
  await client.close().catch(() => undefined);
}

process.exit(0);
