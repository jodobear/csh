import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ApplesauceRelayPool,
  GiftWrapMode,
  NostrMCPProxy,
  PrivateKeySigner,
} from "@contextvm/sdk";

import { configuredLogLevel, loadEnvFile, requiredEnv } from "./client-common";

loadEnvFile();

const privateKey = requiredEnv("CVM_CLIENT_PRIVATE_KEY");
const serverPubkey = requiredEnv("CVM_SERVER_PUBKEY");
const relayUrls = requiredEnv("CVM_RELAYS")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const encryptionMode =
  process.env.CVM_PROXY_ENCRYPTION_MODE ||
  process.env.GW_ENCRYPTION_MODE ||
  "optional";

const signer = new PrivateKeySigner(privateKey);
const relayPool = new ApplesauceRelayPool(relayUrls);
const proxy = new NostrMCPProxy({
  mcpHostTransport: new StdioServerTransport(),
  nostrTransportOptions: {
    signer,
    relayHandler: relayPool,
    serverPubkey,
    encryptionMode,
    giftWrapMode: GiftWrapMode.EPHEMERAL,
    logLevel: configuredLogLevel(),
  },
});

const shutdown = async () => {
  await proxy.stop().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await proxy.start();
