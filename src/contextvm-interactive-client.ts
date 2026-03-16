import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ApplesauceRelayPool,
  GiftWrapMode,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { loadContextVmClientConfig } from "./contextvm/client-config.js";
import { parseToolResult } from "./mcp/tool-result.js";
import { SkewTolerantNostrClientTransport } from "./contextvm/skew-tolerant-client-transport.js";

type OpenResult = {
  sessionId: string;
  cursor: number;
  cols: number;
  rows: number;
  ownerId: string;
  command: string;
};

type PollResult = {
  cursor: number;
  snapshot: string | null;
  changed: boolean;
  closedAt: string | null;
  exitStatus: number | null;
};

const config = loadContextVmClientConfig();

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error("Interactive csh shell requires a TTY on stdin and stdout");
}

const client = new Client({
  name: "csh-contextvm-interactive-client",
  version: "0.1.0",
});

const transport = new SkewTolerantNostrClientTransport(
  {
    signer: new PrivateKeySigner(config.clientPrivateKey),
    relayHandler: new ApplesauceRelayPool(config.relayUrls),
    serverPubkey: config.serverPubkey,
    encryptionMode: config.encryptionMode,
    giftWrapMode: GiftWrapMode.EPHEMERAL,
    logLevel: config.logLevel,
  },
  config.responseLookbackSeconds,
);

let sessionId: string | undefined = process.env.CSH_SESSION_ID;
let cursor = 0;
let lastSnapshot = "";
let screenInitialized = false;
let pollLoopFailed = false;
let localExitRequested = false;
let shuttingDown = false;
let rpcChain = Promise.resolve();
const closeOnExit = process.env.CSH_CLOSE_ON_EXIT === "1";
const shutdownGraceMs = Number.parseInt(process.env.CSH_SHUTDOWN_GRACE_MS || "5000", 10);

const stdin = process.stdin;
const stdout = process.stdout;

await runInteractiveClient()
  .then(() => process.exit(0))
  .catch((error) => {
    if (shouldSuppressDuringShutdown(error)) {
      process.exit(0);
    }
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });

async function runInteractiveClient(): Promise<void> {
  let restoreTerminal: (() => void) | undefined;
  let onInput: ((chunk: Buffer) => void) | undefined;
  let onResize: (() => void) | undefined;

  try {
    await client.connect(transport);

    const initialState = await ensureSession();
    sessionId = initialState.sessionId;
    cursor = initialState.cursor;

    if (initialState.snapshot !== null) {
      lastSnapshot = initialState.snapshot;
    }

    if (initialState.reconnected) {
      console.error(`Reconnected to remote session ${sessionId}`);
      console.error("Ctrl-] disconnects. Ctrl-C sends SIGINT to the remote session.");
      console.error(`Reconnect hint: ${reconnectHint(sessionId)}`);
      await resizeRemote();
    } else {
      console.error(`Connected. Remote session ${sessionId}`);
      console.error("Ctrl-] disconnects. Ctrl-C sends SIGINT to the remote session.");
      console.error(`Reconnect hint: ${reconnectHint(sessionId)}`);
    }

    restoreTerminal = configureTerminal();

    onResize = () => {
      void resizeRemote().catch(reportBackgroundError);
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

    await pollUntilStopped();

    if (pollLoopFailed) {
      throw new Error("Remote session polling failed");
    }
  } finally {
    shuttingDown = true;

    if (onInput) {
      stdin.off("data", onInput);
    }

    if (onResize) {
      process.off("SIGWINCH", onResize);
    }

    restoreTerminal?.();

    if (closeOnExit) {
      await closeSessionIfNeeded();
    } else if (sessionId) {
      console.error(`Disconnected. Reconnect with: ${reconnectHint(sessionId)}`);
    }

    await settleRpcChain();
    await client.close().catch((error) => {
      if (!shouldSuppressDuringShutdown(error)) {
        throw error;
      }
    });
  }
}

async function pollUntilStopped(): Promise<void> {
  while (!localExitRequested && sessionId) {
    try {
      const result = await queueRpc(() =>
        parseToolResult<PollResult>(
          client.callTool({
            name: "session_poll",
            arguments: {
              sessionId,
              cursor,
              keepAlive: true,
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
      if (shouldSuppressDuringShutdown(error)) {
        return;
      }
      pollLoopFailed = true;
      throw error;
    }

    await Bun.sleep(50);
  }
}

async function ensureSession(): Promise<{
  sessionId: string;
  cursor: number;
  snapshot: string | null;
  reconnected: boolean;
}> {
  if (sessionId) {
    try {
      const result = await queueRpc(() =>
        parseToolResult<PollResult>(
          client.callTool({
            name: "session_poll",
            arguments: {
              sessionId,
              cursor: 0,
              keepAlive: true,
            },
          }),
        ),
      );

      if (!result.closedAt) {
        return {
          sessionId,
          cursor: result.cursor,
          snapshot: result.snapshot ?? null,
          reconnected: true,
        };
      }
    } catch (error) {
      if (!isUnknownSessionError(error)) {
        throw error;
      }
    }
  }

  const requestedSessionId = sessionId;
  const openResult = await queueRpc(() =>
    parseToolResult<OpenResult>(
      client.callTool({
        name: "session_open",
        arguments: {
          ...(requestedSessionId ? { sessionId: requestedSessionId } : {}),
          command: process.env.CSH_REMOTE_COMMAND || "/bin/sh",
          ...getTerminalSize(),
        },
      }),
    ),
  );

  return {
    sessionId: openResult.sessionId,
    cursor: openResult.cursor,
    snapshot: null,
    reconnected: false,
  };
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

  if (lastSnapshot && nextSnapshot.startsWith(lastSnapshot)) {
    stdout.write(nextSnapshot.slice(lastSnapshot.length));
  } else {
    stdout.write("\x1b[H\x1b[2J");
    stdout.write(nextSnapshot);
  }
  lastSnapshot = nextSnapshot;
}

async function resizeRemote(): Promise<void> {
  if (!sessionId) {
    return;
  }

  const { cols, rows } = getTerminalSize();
  await queueRpc(() =>
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
  );
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
          arguments: {
            sessionId: activeSessionId,
          },
        }),
      )
    );
  } catch (error) {
    reportBackgroundError(error);
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

function reportBackgroundError(error: unknown): void {
  if (shouldSuppressDuringShutdown(error)) {
    return;
  }
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
}

async function settleRpcChain(): Promise<void> {
  await Promise.race([
    rpcChain.catch(() => undefined),
    Bun.sleep(Number.isFinite(shutdownGraceMs) && shutdownGraceMs > 0 ? shutdownGraceMs : 5000),
  ]);
}

function reconnectHint(activeSessionId: string): string {
  const envFile = process.env.CVM_ENV_FILE;
  if (envFile) {
    return `bin/csh shell --session ${activeSessionId} --config ${envFile}`;
  }
  return `bin/csh shell --session ${activeSessionId}`;
}

function isUnknownSessionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Unknown session:");
}

function shouldSuppressDuringShutdown(error: unknown): boolean {
  if (!(localExitRequested || shuttingDown)) {
    return false;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Connection closed") ||
    error.message.includes("Publish event timed out") ||
    error.message.includes("Transport closed")
  );
}

function clampDimension(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(20, Math.min(400, Math.trunc(value)));
}
