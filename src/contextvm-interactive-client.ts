import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ApplesauceRelayPool,
  EncryptionMode,
  GiftWrapMode,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { z } from "zod";
import { SkewTolerantNostrClientTransport } from "./contextvm/skew-tolerant-client-transport.js";

const envSchema = z.object({
  CSH_CLIENT_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CSH_CLIENT_PRIVATE_KEY must be a 64-character hex private key"),
  CSH_SERVER_PUBKEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CSH_SERVER_PUBKEY must be a 64-character hex pubkey"),
  CSH_NOSTR_RELAY_URLS: z
    .string()
    .trim()
    .min(1, "CSH_NOSTR_RELAY_URLS must contain at least one relay URL"),
  CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS: z
    .string()
    .trim()
    .regex(/^\d+$/, "CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS must be an integer")
    .optional(),
});

const env = envSchema.parse(process.env);
const relayUrls = env.CSH_NOSTR_RELAY_URLS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);
const responseLookbackSeconds = env.CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS
  ? Number.parseInt(env.CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS, 10)
  : 300;

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error("Interactive ContextVM demo requires a TTY on stdin and stdout");
}

const client = new Client({
  name: "csh-contextvm-interactive-client",
  version: "0.1.0",
});

const transport = new SkewTolerantNostrClientTransport(
  {
    signer: new PrivateKeySigner(env.CSH_CLIENT_PRIVATE_KEY),
    relayHandler: new ApplesauceRelayPool(relayUrls),
    serverPubkey: env.CSH_SERVER_PUBKEY,
    encryptionMode: EncryptionMode.REQUIRED,
    giftWrapMode: GiftWrapMode.EPHEMERAL,
    logLevel: "error",
  },
  responseLookbackSeconds,
);

type OpenResult = {
  sessionId: string;
  cursor: number;
};

type PollResult = {
  cursor: number;
  snapshot: string | null;
  changed: boolean;
  closedAt: string | null;
  exitStatus: number | null;
};

let sessionId: string | undefined;
let cursor = 0;
let lastSnapshot = "";
let screenInitialized = false;
let pollLoopFailed = false;
let localExitRequested = false;
let rpcChain = Promise.resolve();

const stdin = process.stdin;
const stdout = process.stdout;

await runInteractiveClient()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });

async function runInteractiveClient(): Promise<void> {
  let restoreTerminal: (() => void) | undefined;
  let onInput: ((chunk: Buffer) => void) | undefined;
  let onResize: (() => void) | undefined;

  try {
    console.error("Connecting to remote csh server over ContextVM...");
    console.error(`Target server pubkey: ${env.CSH_SERVER_PUBKEY}`);
    console.error(`Relay URLs: ${relayUrls.join(", ")}`);
    console.error(`Response lookback: ${responseLookbackSeconds}s`);

    await client.connect(transport);

    const openResult = await queueRpc(() =>
      parseToolResult<OpenResult>(
        client.callTool({
          name: "session_open",
          arguments: {
            command: "/bin/sh",
            ...getTerminalSize(),
          },
        }),
      )
    );

    sessionId = openResult.sessionId;
    cursor = openResult.cursor;

    console.error(`Connected. Remote session ${sessionId}`);
    console.error("Ctrl-] closes the client. Ctrl-C sends SIGINT to the remote session.");

    restoreTerminal = configureTerminal();

    onResize = () => {
      if (!sessionId) {
        return;
      }

      const { cols, rows } = getTerminalSize();
      void queueRpc(() =>
        parseToolResult(
          client.callTool({
            name: "session_resize",
            arguments: {
              sessionId,
              cols,
              rows,
            },
          }),
        )
      ).catch(reportBackgroundError);
    };

    onInput = (chunk: Buffer) => {
      if (!sessionId || localExitRequested) {
        return;
      }

      if (chunk.length === 1 && chunk[0] === 0x1d) {
        localExitRequested = true;
        return;
      }

      if (chunk.length === 1 && chunk[0] === 0x03) {
        void queueRpc(() =>
          parseToolResult(
            client.callTool({
              name: "session_signal",
              arguments: {
                sessionId,
                signal: "SIGINT",
              },
            }),
          )
        ).catch(reportBackgroundError);
        return;
      }

      void queueRpc(() =>
        parseToolResult(
          client.callTool({
            name: "session_write",
            arguments: {
              sessionId,
              input: chunk.toString("utf8"),
            },
          }),
        )
      ).catch(reportBackgroundError);
    };

    stdin.on("data", onInput);
    process.on("SIGWINCH", onResize);

    await pollUntilClosed();

    if (pollLoopFailed) {
      throw new Error("Remote session polling failed");
    }
  } finally {
    if (onInput) {
      stdin.off("data", onInput);
    }

    if (onResize) {
      process.off("SIGWINCH", onResize);
    }

    restoreTerminal?.();
    await closeSessionIfNeeded();
    await client.close();
  }
}

async function pollUntilClosed(): Promise<void> {
  while (!localExitRequested && sessionId) {
    try {
      const result = await queueRpc(() =>
        parseToolResult<PollResult>(
          client.callTool({
            name: "session_poll",
            arguments: {
              sessionId,
              cursor,
            },
          }),
        )
      );

      cursor = result.cursor;

      if (result.snapshot !== null && result.snapshot !== lastSnapshot) {
        renderSnapshot(result.snapshot);
      }

      if (result.closedAt) {
        stdout.write(
          `\n[remote session closed${result.exitStatus !== null ? ` with status ${result.exitStatus}` : ""}]\n`,
        );
        sessionId = undefined;
        return;
      }
    } catch (error) {
      pollLoopFailed = true;
      throw error;
    }

    await Bun.sleep(50);
  }
}

function configureTerminal(): () => void {
  stdin.resume();
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);

  return () => {
    if (screenInitialized) {
      stdout.write("\x1b[?1049l");
      screenInitialized = false;
    }
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdin.pause();
  };
}

function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: clampDimension(stdout.columns, 80),
    rows: clampDimension(stdout.rows, 24),
  };
}

function renderSnapshot(nextSnapshot: string): void {
  if (!screenInitialized) {
    stdout.write("\x1b[?1049h");
    screenInitialized = true;
  }

  stdout.write("\x1b[H\x1b[2J");
  stdout.write(nextSnapshot);
  lastSnapshot = nextSnapshot;
}

async function closeSessionIfNeeded(): Promise<void> {
  if (!sessionId) {
    return;
  }

  const activeSessionId = sessionId;
  sessionId = undefined;

  try {
    await queueRpc(() =>
      parseToolResult(
        client.callTool({
          name: "session_close",
          arguments: { sessionId: activeSessionId },
        }),
      )
    );
  } catch (error) {
    console.error(
      `Failed to close remote session ${activeSessionId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function queueRpc<T>(operation: () => Promise<T>): Promise<T> {
  const next = rpcChain.then(operation, operation);
  rpcChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function clampDimension(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(20, Math.min(400, Math.trunc(value)));
}

function reportBackgroundError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
}

function parseToolResult<T>(result: Promise<unknown>): Promise<T>;
function parseToolResult<T>(result: unknown): T;
function parseToolResult<T>(result: Promise<unknown> | unknown): Promise<T> | T {
  if (result instanceof Promise) {
    return result.then((value) => parseToolResult<T>(value));
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result &&
    result.structuredContent
  ) {
    return result.structuredContent as T;
  }

  if (
    typeof result === "object" &&
    result !== null &&
    "isError" in result &&
    result.isError === true
  ) {
    throw new Error(`Tool call failed: ${extractTextContent(result)}`);
  }

  const textContent = extractTextContent(result);
  if (textContent) {
    try {
      return JSON.parse(textContent) as T;
    } catch (error) {
      throw new Error(
        `Expected structuredContent or JSON text in tool result; received text: ${textContent}`,
        { cause: error },
      );
    }
  }

  throw new Error("Expected structuredContent or JSON text in tool result");
}

function extractTextContent(result: unknown): string | undefined {
  if (
    typeof result !== "object" ||
    result === null ||
    !("content" in result) ||
    !Array.isArray(result.content)
  ) {
    return undefined;
  }

  const textPart = result.content.find((item) =>
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "text" &&
    "text" in item &&
    typeof item.text === "string"
  );

  return textPart?.text;
}
