import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createShellBridgeFromClient, type ShellBridge } from "./shell-bridge.js";

export async function createLocalShellBridge(): Promise<ShellBridge> {
  const client = new Client({
    name: "csh-browser-shell-bridge",
    version: "0.1.0",
  });

  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["run", "src/main.ts"],
      cwd: process.cwd(),
      stderr: "inherit",
    }),
  );

  return createShellBridgeFromClient(client);
}
