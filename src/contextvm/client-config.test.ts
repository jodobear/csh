import { describe, expect, test } from "bun:test";
import { loadContextVmClientConfig } from "./client-config.js";

describe("loadContextVmClientConfig", () => {
  test("parses relay URLs and response lookback", () => {
    const config = loadContextVmClientConfig({
      CSH_CLIENT_PRIVATE_KEY: "a".repeat(64),
      CSH_SERVER_PUBKEY: "b".repeat(64),
      CSH_NOSTR_RELAY_URLS: "ws://relay-one.example, ws://relay-two.example",
      CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS: "120",
    });

    expect(config.relayUrls).toEqual([
      "ws://relay-one.example",
      "ws://relay-two.example",
    ]);
    expect(config.responseLookbackSeconds).toBe(120);
  });

  test("rejects missing required settings", () => {
    expect(() => loadContextVmClientConfig({})).toThrow();
  });
});
