import { z } from "zod";

const clientEnvSchema = z.object({
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
  CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS: z
    .string()
    .trim()
    .regex(/^\d+$/, "CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS must be an integer")
    .optional(),
});

export type ContextVmClientConfig = {
  clientPrivateKey: string;
  serverPubkey: string;
  relayUrls: string[];
  responseLookbackSeconds: number;
};

export function loadContextVmClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): ContextVmClientConfig {
  const parsed = clientEnvSchema.parse(env);

  return {
    clientPrivateKey: parsed.CSH_CLIENT_PRIVATE_KEY,
    serverPubkey: parsed.CSH_SERVER_PUBKEY,
    relayUrls: parseCsvList(parsed.CSH_NOSTR_RELAY_URLS),
    responseLookbackSeconds: parsed.CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS
      ? Number.parseInt(parsed.CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS, 10)
      : 300,
  };
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
