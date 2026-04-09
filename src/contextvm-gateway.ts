import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ApplesauceRelayPool,
  NostrMCPGateway,
  PrivateKeySigner,
} from "@contextvm/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadContextVmConfig } from "./contextvm/config.js";

const config = loadContextVmConfig();
const signer = new PrivateKeySigner(config.privateKey);
const relayHandler = new ApplesauceRelayPool(config.relayUrls);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

const gateway = new NostrMCPGateway({
  createMcpClientTransport: () =>
    new StdioClientTransport({
      command: process.execPath,
      args: ["run", path.join(projectRoot, "src", "main.ts")],
      cwd: projectRoot,
      env: {
        ...process.env,
      },
      stderr: "inherit",
    }),
  nostrTransportOptions: {
    signer,
    relayHandler,
    allowedPublicKeys: [],
    injectClientPubkey: true,
    encryptionMode: config.encryptionMode,
    giftWrapMode: config.giftWrapMode,
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
console.error(`Shell allowlist seed pubkeys: ${config.allowlistSeedPublicKeys.join(", ")}`);

async function shutdown(exitCode: number): Promise<never> {
  if (gateway.isActive()) {
    await gateway.stop();
  }

  process.exit(exitCode);
}
