import { describe, expect, test } from "bun:test";
import { resolvePreviewConfigFromEnv } from "./preview-config";

describe("browser preview config", () => {
  test("prefers browser relay and server overrides over host defaults", () => {
    const config = resolvePreviewConfigFromEnv({
      CSH_BROWSER_RELAY_URLS: "ws://100.64.0.10:10552, wss://relay.example",
      CVM_RELAYS: "ws://127.0.0.1:10552",
      CSH_BROWSER_SERVER_PUBKEY: "b".repeat(64),
      CVM_SERVER_PUBKEY: "a".repeat(64),
      CSH_BROWSER_DEFAULT_SIGNER: "bunker",
    });

    expect(config.defaultRelayUrls).toEqual(["ws://100.64.0.10:10552", "wss://relay.example"]);
    expect(config.defaultServerPubkey).toBe("b".repeat(64));
    expect(config.defaultSignerKind).toBe("bunker");
    expect(config.modeLabel).toBe("static-preview");
  });

  test("enables the test signer only when a preview key exists", () => {
    expect(resolvePreviewConfigFromEnv({}).enableTestSigner).toBe(false);

    const config = resolvePreviewConfigFromEnv({
      CSH_BROWSER_TEST_SIGNER_PRIVATE_KEY: "1".repeat(64),
    });
    expect(config.enableTestSigner).toBe(true);
    expect(config.testSignerPrivateKey).toBe("1".repeat(64));
  });
});
