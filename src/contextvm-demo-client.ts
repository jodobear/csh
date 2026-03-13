import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ApplesauceRelayPool,
  EncryptionMode,
  GiftWrapMode,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { loadContextVmClientConfig } from "./contextvm/client-config.js";
import { parseToolResult } from "./mcp/tool-result.js";
import { SkewTolerantNostrClientTransport } from "./contextvm/skew-tolerant-client-transport.js";
const config = loadContextVmClientConfig();

const client = new Client({
  name: "csh-contextvm-demo-client",
  version: "0.1.0",
});

const transport = new SkewTolerantNostrClientTransport(
  {
    signer: new PrivateKeySigner(config.clientPrivateKey),
    relayHandler: new ApplesauceRelayPool(config.relayUrls),
    serverPubkey: config.serverPubkey,
    encryptionMode: EncryptionMode.REQUIRED,
    giftWrapMode: GiftWrapMode.EPHEMERAL,
  },
  config.responseLookbackSeconds,
);

let sessionId: string | undefined;

try {
  console.log("Connecting to remote csh server over ContextVM...");
  console.log(`Target server pubkey: ${config.serverPubkey}`);
  console.log(`Relay URLs: ${config.relayUrls.join(", ")}`);
  console.log(`Response lookback: ${config.responseLookbackSeconds}s`);
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
