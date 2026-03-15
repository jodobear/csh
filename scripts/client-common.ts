import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ApplesauceRelayPool,
  GiftWrapMode,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { loadContextVmClientConfig } from "../src/contextvm/client-config.js";
import { SkewTolerantNostrClientTransport } from "../src/contextvm/skew-tolerant-client-transport.js";
import { parseToolResult } from "../src/mcp/tool-result.js";

type ClientLogLevel = "debug" | "info" | "warn" | "error" | "silent";
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
  cols: number;
  rows: number;
  closedAt: string | null;
  exitStatus: number | null;
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value.replace(/\\ /g, " ");
}

export function loadEnvFile(envFile = process.env.CVM_ENV_FILE || ".env.phase1.local"): void {
  const text = readFileSync(envFile, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    if (process.env[key]) {
      continue;
    }
    const value = stripQuotes(line.slice(separator + 1));
    process.env[key] = value;
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function configuredLogLevel(): ClientLogLevel {
  const value = (process.env.CVM_LOG_LEVEL || "error") as ClientLogLevel;
  return value;
}

export async function createDirectClient(name: string): Promise<Client> {
  const config = loadContextVmClientConfig(process.env);

  const signer = new PrivateKeySigner(config.clientPrivateKey);
  const relayPool = new ApplesauceRelayPool(config.relayUrls);
  const transport = new SkewTolerantNostrClientTransport({
    signer,
    relayHandler: relayPool,
    serverPubkey: config.serverPubkey,
    encryptionMode: config.encryptionMode,
    giftWrapMode: GiftWrapMode.EPHEMERAL,
    logLevel: config.logLevel || configuredLogLevel(),
  }, config.responseLookbackSeconds);

  const client = new Client({
    name,
    version: "0.1.0",
  });

  await client.connect(transport);
  return client;
}

export function extractText(result: {
  content?: Array<{ type?: string; text?: string }>;
}): string {
  return result.content
    ?.filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n") ?? "";
}

export function parseShellPid(text: string): number | null {
  const match = text.match(/PID: (\d+)/);
  return match ? Number(match[1]) : null;
}

export function parseCommandOutput(text: string): string | null {
  const match = text.match(/Output:([\s\S]*?)\nSession ID:/);
  return match ? match[1].trim() : null;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callTool<T>(
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

export async function openSession(
  client: Client,
  overrides: Partial<{ sessionId: string; command: string; cwd: string; cols: number; rows: number; ownerId: string }> = {},
): Promise<SessionOpenResult> {
  return await callTool<SessionOpenResult>(client, "session_open", {
    ...(overrides.sessionId ? { sessionId: overrides.sessionId } : {}),
    command: overrides.command ?? "/bin/sh",
    cols: overrides.cols ?? 80,
    rows: overrides.rows ?? 24,
    ...(overrides.cwd ? { cwd: overrides.cwd } : {}),
    ...(overrides.ownerId ? { ownerId: overrides.ownerId } : {}),
  });
}

export async function writeSession(
  client: Client,
  sessionId: string,
  input: string,
  ownerId?: string,
): Promise<void> {
  await callTool(client, "session_write", {
    sessionId,
    input,
    ...(ownerId ? { ownerId } : {}),
  });
}

export async function pollSession(
  client: Client,
  sessionId: string,
  cursor?: number,
  ownerId?: string,
): Promise<SessionPollResult> {
  return await callTool<SessionPollResult>(client, "session_poll", {
    sessionId,
    ...(cursor === undefined ? {} : { cursor }),
    ...(ownerId ? { ownerId } : {}),
  });
}

export async function closeSession(
  client: Client,
  sessionId: string,
  ownerId?: string,
): Promise<void> {
  await callTool(client, "session_close", {
    sessionId,
    ...(ownerId ? { ownerId } : {}),
  });
}

export async function waitForSnapshot(
  client: Client,
  sessionId: string,
  predicate: (snapshot: string, result: SessionPollResult) => boolean,
  options?: { ownerId?: string; timeoutMs?: number; pollMs?: number; cursor?: number },
): Promise<SessionPollResult> {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const pollMs = options?.pollMs ?? 60;
  const startedAt = Date.now();
  let cursor = options?.cursor;
  let lastResult: SessionPollResult | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    const result = await pollSession(client, sessionId, cursor, options?.ownerId);
    cursor = result.cursor;
    lastResult = result;

    if (result.snapshot !== null && predicate(result.snapshot, result)) {
      return result;
    }

    if (result.closedAt) {
      return result;
    }

    await sleep(pollMs);
  }

  throw new Error(`Timed out waiting for session ${sessionId} snapshot`);
}

export function newOwnerId(): string {
  return randomUUID();
}
