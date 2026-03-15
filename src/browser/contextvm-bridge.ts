import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  ApplesauceRelayPool,
  GiftWrapMode,
  PrivateKeySigner,
} from "@contextvm/sdk";
import { loadContextVmClientConfig } from "../contextvm/client-config.js";
import { SkewTolerantNostrClientTransport } from "../contextvm/skew-tolerant-client-transport.js";
import { createShellBridgeFromClient, type ShellBridge } from "./shell-bridge.js";

export async function createContextVmShellBridge(): Promise<ShellBridge> {
  const config = loadContextVmClientConfig();
  const signer = new PrivateKeySigner(config.clientPrivateKey);
  const ownerId = await signer.getPublicKey();
  const client = new Client({
    name: "csh-browser-contextvm-bridge",
    version: "0.1.0",
  });

  const transport = new SkewTolerantNostrClientTransport(
    {
      signer,
      relayHandler: new ApplesauceRelayPool(config.relayUrls),
      serverPubkey: config.serverPubkey,
      encryptionMode: config.encryptionMode,
      giftWrapMode: GiftWrapMode.EPHEMERAL,
      logLevel: config.logLevel,
    },
    config.responseLookbackSeconds,
  );

  await client.connect(transport);
  const bridge = createShellBridgeFromClient(client);

  return {
    async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
      return bridge.callTool(name, {
        ...args,
        ownerId,
      });
    },
    async close(): Promise<void> {
      await bridge.close();
    },
  };
}
