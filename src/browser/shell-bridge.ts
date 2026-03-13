import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult } from "../mcp/tool-result.js";

export type ShellBridge = {
  callTool<T>(name: string, args: Record<string, unknown>): Promise<T>;
  close(): Promise<void>;
};

export function createShellBridgeFromClient(client: Client): ShellBridge {
  let rpcChain = Promise.resolve();

  return {
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return queueRpc<T>(async () => {
        const result = await client.callTool({
          name,
          arguments: args,
        });

        return parseToolResult<T>(result);
      });
    },
    async close(): Promise<void> {
      await client.close();
    },
  };

  function queueRpc<T>(operation: () => Promise<T>): Promise<T> {
    const next = rpcChain.then(operation, operation);
    rpcChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
