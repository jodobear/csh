import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ApplesauceRelayPool, EncryptionMode, GiftWrapMode } from "@contextvm/sdk";
import { parseToolResult } from "../mcp/tool-result.js";
import { SkewTolerantNostrClientTransport } from "../contextvm/skew-tolerant-client-transport.js";
import type { BrowserSigner } from "./signers.js";

type AuthStatusResult = {
  actorPubkey: string;
  allowlisted: boolean;
  serverName: string;
};

type SessionOpenResult = {
  sessionId: string;
  cursor: number;
  cols: number;
  rows: number;
  ownerId: string;
  command: string;
};

type SessionPollResult = {
  sessionId: string;
  changed: boolean;
  cursor: number;
  snapshot: string | null;
  snapshotBase64?: string | null;
  delta?: string | null;
  deltaBase64?: string | null;
  cols: number;
  rows: number;
  closedAt: string | null;
  exitStatus: number | null;
};

type ShellClientOptions = {
  signer: BrowserSigner;
  relayUrls: string[];
  serverPubkey: string;
  responseLookbackSeconds?: number;
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
};

type RetryOptions = {
  retries?: number;
  backoffMs?: number;
};

export async function createBrowserShellClient(options: ShellClientOptions) {
  const client = new Client({
    name: "csh-browser-static",
    version: "0.1.0",
  });

  const transport = new SkewTolerantNostrClientTransport(
    {
      signer: options.signer,
      relayHandler: new ApplesauceRelayPool(options.relayUrls),
      serverPubkey: options.serverPubkey,
      encryptionMode: EncryptionMode.REQUIRED,
      giftWrapMode: GiftWrapMode.EPHEMERAL,
      logLevel: options.logLevel ?? "error",
    },
    options.responseLookbackSeconds ?? 300,
  );

  await client.connect(transport);

  return {
    async authStatus(): Promise<AuthStatusResult> {
      return await callToolWithRetry<AuthStatusResult>(client, "auth_status", {}, { retries: 2 });
    },
    async redeemInvite(inviteToken: string): Promise<AuthStatusResult & { redeemed: boolean }> {
      return await callToolWithRetry<AuthStatusResult & { redeemed: boolean }>(
        client,
        "auth_redeem_invite",
        { inviteToken },
        { retries: 2 },
      );
    },
    async openSession(args: {
      sessionId?: string;
      cols: number;
      rows: number;
    }): Promise<SessionOpenResult> {
      return await callTool<SessionOpenResult>(client, "session_open", args);
    },
    async writeSession(args: {
      sessionId: string;
      inputBase64: string;
    }): Promise<void> {
      await callTool(client, "session_write", args);
    },
    async resizeSession(args: {
      sessionId: string;
      cols: number;
      rows: number;
    }): Promise<void> {
      await callTool(client, "session_resize", args);
    },
    async signalSession(args: {
      sessionId: string;
      signal: "SIGINT" | "SIGTERM" | "SIGHUP";
    }): Promise<void> {
      await callTool(client, "session_signal", args);
    },
    async pollSession(args: {
      sessionId: string;
      cursor?: number;
      keepAlive?: boolean;
    }): Promise<SessionPollResult> {
      return await callToolWithRetry<SessionPollResult>(client, "session_poll", args, { retries: 1 });
    },
    async closeSession(sessionId: string): Promise<void> {
      await callTool(client, "session_close", { sessionId });
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}

async function callTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  return parseToolResult<T>(
    await client.callTool({
      name,
      arguments: args,
    }),
  );
}

async function callToolWithRetry<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 1;
  const backoffMs = options.backoffMs ?? 900;
  let attempt = 0;
  while (true) {
    try {
      return await callTool<T>(client, name, args);
    } catch (error) {
      if (attempt >= retries || !isTimeoutError(error)) {
        throw error;
      }
      attempt += 1;
      await Bun.sleep(backoffMs * attempt);
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /request timed out/i.test(message);
}
