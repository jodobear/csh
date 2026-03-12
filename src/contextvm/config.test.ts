import { describe, expect, test } from "bun:test";
import { loadContextVmConfig } from "./config.js";

describe("loadContextVmConfig", () => {
  test("parses relay and pubkey lists", () => {
    const config = loadContextVmConfig({
      CSH_NOSTR_PRIVATE_KEY: "a".repeat(64),
      CSH_NOSTR_RELAY_URLS: "wss://relay-one.example,wss://relay-two.example",
      CSH_ALLOWED_PUBLIC_KEYS: "pubkey-one,pubkey-two",
    });

    expect(config.relayUrls).toEqual([
      "wss://relay-one.example",
      "wss://relay-two.example",
    ]);
    expect(config.allowedPublicKeys).toEqual(["pubkey-one", "pubkey-two"]);
    expect(config.serverInfo.name).toBe("csh private shell");
  });

  test("rejects missing required settings", () => {
    expect(() => loadContextVmConfig({})).toThrow();
  });
});
