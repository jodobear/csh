import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ApplesauceRelayPool,
  EncryptionMode,
  GiftWrapMode,
  NostrClientTransport,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { z } from "zod";

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
});

const env = envSchema.parse(process.env);
const relayUrls = env.CSH_NOSTR_RELAY_URLS.split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const client = new Client({
  name: "csh-contextvm-demo-client",
  version: "0.1.0",
});

const transport = new NostrClientTransport({
  signer: new PrivateKeySigner(env.CSH_CLIENT_PRIVATE_KEY),
  relayHandler: new ApplesauceRelayPool(relayUrls),
  serverPubkey: env.CSH_SERVER_PUBKEY,
  encryptionMode: EncryptionMode.REQUIRED,
  giftWrapMode: GiftWrapMode.EPHEMERAL,
});

let sessionId: string | undefined;

try {
  console.log("Connecting to remote csh server over ContextVM...");
  await client.connect(transport);
  console.log("Connected. Opening remote shell session...");

  const openResult = parseToolResult<{
    sessionId: string;
    cursor: number;
    command: string;
  }>(
    await client.callTool({
      name: "session_open",
      arguments: {
        command: "/bin/sh",
        cols: 100,
        rows: 28,
      },
    }),
  );

  sessionId = openResult.sessionId;
  console.log(`Opened remote session ${sessionId}`);

  const doneMarker = "__CSH_REMOTE_DEMO_DONE__";

  await client.callTool({
    name: "session_write",
    arguments: {
      sessionId,
      input: `printf 'csh remote demo ready\\n'; pwd; uname -s; printf '${doneMarker}\\n'\n`,
    },
  });

  let cursor = openResult.cursor;
  let snapshot = "";

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pollResult = parseToolResult<{
      cursor: number;
      snapshot: string | null;
      changed: boolean;
      closedAt: string | null;
      exitStatus: number | null;
    }>(
      await client.callTool({
        name: "session_poll",
        arguments: {
          sessionId,
          cursor,
        },
      }),
    );

    cursor = pollResult.cursor;
    snapshot = pollResult.snapshot ?? snapshot;

    if (snapshot.includes(doneMarker)) {
      break;
    }

    await Bun.sleep(100);
  }

  console.log("\nRemote snapshot:\n");
  console.log(snapshot.trimEnd());
} finally {
  if (sessionId) {
    await client.callTool({
      name: "session_close",
      arguments: { sessionId },
    });
  }

  await client.close();
}

function parseToolResult<T>(result: unknown): T {
  if (
    typeof result === "object" &&
    result !== null &&
    "structuredContent" in result &&
    result.structuredContent
  ) {
    return result.structuredContent as T;
  }

  throw new Error("Expected structuredContent in tool result");
}
