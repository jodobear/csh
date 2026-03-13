import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ApplesauceRelayPool,
  EncryptionMode,
  GiftWrapMode,
  NostrMCPGateway,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { loadContextVmConfig } from "./contextvm/config.js";

const config = loadContextVmConfig();

const signer = new PrivateKeySigner(config.privateKey);
const relayHandler = new ApplesauceRelayPool(config.relayUrls);

const gateway = new NostrMCPGateway({
  createMcpClientTransport: () =>
    new StdioClientTransport({
      command: process.execPath,
      args: ["run", "src/main.ts"],
      cwd: process.cwd(),
      stderr: "inherit",
    }),
  nostrTransportOptions: {
    signer,
    relayHandler,
    allowedPublicKeys: config.allowedPublicKeys,
    injectClientPubkey: true,
    encryptionMode: EncryptionMode.REQUIRED,
    giftWrapMode: GiftWrapMode.EPHEMERAL,
    isPublicServer: false,
    publishRelayList: false,
    serverInfo: config.serverInfo,
  },
});

process.on("SIGINT", async () => {
  await shutdown(0);
});

process.on("SIGTERM", async () => {
  await shutdown(0);
});

process.on("uncaughtException", async (error) => {
  console.error("Uncaught exception:", error);
  await shutdown(1);
});

process.on("unhandledRejection", async (reason) => {
  console.error("Unhandled rejection:", reason);
  await shutdown(1);
});

await gateway.start();

console.error("csh ContextVM gateway started");
console.error(`Server pubkey: ${await signer.getPublicKey()}`);
console.error(`Relay URLs: ${config.relayUrls.join(", ")}`);
console.error(`Allowed client pubkeys: ${config.allowedPublicKeys.join(", ")}`);

async function shutdown(exitCode: number): Promise<never> {
  if (gateway.isActive()) {
    await gateway.stop();
  }

  process.exit(exitCode);
}
