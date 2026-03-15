import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createShellBridgeFromClient, type ShellBridge } from "./shell-bridge.js";

export async function createLocalShellBridge(): Promise<ShellBridge> {
  const ownerId = randomUUID();
  const client = new Client({
    name: "csh-browser-shell-bridge",
    version: "0.1.0",
  });

  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["run", "src/main.ts"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        CSH_FORCED_OWNER_ID: ownerId,
      },
      stderr: "inherit",
    }),
  );

  const bridge = createShellBridgeFromClient(client);
  return {
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return bridge.callTool(name, {
        ...args,
        ownerId,
      });
    },
    async close(): Promise<void> {
      await bridge.close();
    },
  };
}
