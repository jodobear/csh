import { EncryptionMode } from "@contextvm/sdk";
import { z } from "zod";

const clientEnvSchema = z.object({
  CVM_CLIENT_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CVM_CLIENT_PRIVATE_KEY must be a 64-character hex private key")
    .optional(),
  CSH_CLIENT_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CSH_CLIENT_PRIVATE_KEY must be a 64-character hex private key")
    .optional(),
  CVM_SERVER_PUBKEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CVM_SERVER_PUBKEY must be a 64-character hex pubkey")
    .optional(),
  CSH_SERVER_PUBKEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CSH_SERVER_PUBKEY must be a 64-character hex pubkey")
    .optional(),
  CVM_RELAYS: z.string().trim().min(1).optional(),
  CSH_NOSTR_RELAY_URLS: z.string().trim().min(1).optional(),
  CVM_RESPONSE_LOOKBACK_SECONDS: z
    .string()
    .trim()
    .regex(/^\d+$/, "CVM_RESPONSE_LOOKBACK_SECONDS must be an integer")
    .optional(),
  CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS: z
    .string()
    .trim()
    .regex(/^\d+$/, "CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS must be an integer")
    .optional(),
  CVM_PROXY_ENCRYPTION_MODE: z.enum(["optional", "required", "disabled"]).optional(),
  CSH_ENCRYPTION_MODE: z.enum(["optional", "required", "disabled"]).optional(),
  CVM_LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).optional(),
});

export type ContextVmClientConfig = {
  clientPrivateKey: string;
  serverPubkey: string;
  relayUrls: string[];
  responseLookbackSeconds: number;
  encryptionMode: EncryptionMode;
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
};

export function loadContextVmClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): ContextVmClientConfig {
  const parsed = clientEnvSchema.parse(env);
  const clientPrivateKey = parsed.CVM_CLIENT_PRIVATE_KEY ?? parsed.CSH_CLIENT_PRIVATE_KEY;
  const serverPubkey = parsed.CVM_SERVER_PUBKEY ?? parsed.CSH_SERVER_PUBKEY;
  const relaySource = parsed.CVM_RELAYS ?? parsed.CSH_NOSTR_RELAY_URLS;

  if (!clientPrivateKey) {
    throw new Error("Missing CVM_CLIENT_PRIVATE_KEY or CSH_CLIENT_PRIVATE_KEY");
  }
  if (!serverPubkey) {
    throw new Error("Missing CVM_SERVER_PUBKEY or CSH_SERVER_PUBKEY");
  }
  if (!relaySource) {
    throw new Error("Missing CVM_RELAYS or CSH_NOSTR_RELAY_URLS");
  }

  return {
    clientPrivateKey,
    serverPubkey,
    relayUrls: parseCsvList(relaySource),
    responseLookbackSeconds: Number.parseInt(
      parsed.CVM_RESPONSE_LOOKBACK_SECONDS ??
        parsed.CSH_NOSTR_RESPONSE_LOOKBACK_SECONDS ??
        "300",
      10,
    ),
    encryptionMode: parseEncryptionMode(
      parsed.CVM_PROXY_ENCRYPTION_MODE ?? parsed.CSH_ENCRYPTION_MODE,
    ),
    logLevel: parsed.CVM_LOG_LEVEL ?? "error",
  };
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseEncryptionMode(value: string | undefined): EncryptionMode {
  switch (value) {
    case "disabled":
      return EncryptionMode.DISABLED;
    case "required":
      return EncryptionMode.REQUIRED;
    case "optional":
    case undefined:
      return EncryptionMode.OPTIONAL;
    default:
      throw new Error(`Unsupported encryption mode: ${value}`);
  }
}
