import type { PreviewConfig } from "./app-model.js";

type BrowserEnv = Record<string, string | undefined>;

export function resolvePreviewConfigFromEnv(env: BrowserEnv): PreviewConfig {
  const relaySource = env.CSH_BROWSER_RELAY_URLS || env.CVM_RELAYS || env.CSH_NOSTR_RELAY_URLS || "";
  const relayUrls = relaySource
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const testSignerPrivateKey =
    env.CSH_BROWSER_TEST_SIGNER_PRIVATE_KEY || env.CVM_CLIENT_PRIVATE_KEY || env.CSH_CLIENT_PRIVATE_KEY;
  return {
    defaultRelayUrls: relayUrls,
    defaultServerPubkey: (env.CSH_BROWSER_SERVER_PUBKEY || env.CVM_SERVER_PUBKEY || env.CSH_SERVER_PUBKEY || "").trim(),
    defaultSignerKind: normalizeSignerKind(env.CSH_BROWSER_DEFAULT_SIGNER),
    enableTestSigner: Boolean(testSignerPrivateKey),
    testSignerPrivateKey,
    modeLabel: "static-preview",
  };
}

function normalizeSignerKind(
  value: string | undefined,
): PreviewConfig["defaultSignerKind"] {
  switch (value) {
    case "bunker":
    case "amber":
    case "test":
      return value;
    default:
      return "nip07";
  }
}
