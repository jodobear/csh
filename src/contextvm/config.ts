import { EncryptionMode, GiftWrapMode } from "@contextvm/sdk";
import { z } from "zod";

const envSchema = z.object({
  GW_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "GW_PRIVATE_KEY must be a 64-character hex private key")
    .optional(),
  CSH_NOSTR_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CSH_NOSTR_PRIVATE_KEY must be a 64-character hex private key")
    .optional(),
  CVM_RELAYS: z.string().trim().min(1).optional(),
  CSH_NOSTR_RELAY_URLS: z.string().trim().min(1).optional(),
  GW_ALLOWED_PUBLIC_KEYS: z.string().trim().optional(),
  CSH_ALLOWED_PUBLIC_KEYS: z.string().trim().optional(),
  GW_ALLOW_UNLISTED_CLIENTS: z.string().trim().optional(),
  CSH_ALLOW_UNLISTED_CLIENTS: z.string().trim().optional(),
  GW_SERVER_INFO_NAME: z.string().trim().optional(),
  CSH_SERVER_NAME: z.string().trim().optional(),
  GW_SERVER_INFO_WEBSITE: z.string().trim().optional(),
  CSH_SERVER_WEBSITE: z.string().trim().optional(),
  CSH_SERVER_ABOUT: z.string().trim().optional(),
  GW_ENCRYPTION_MODE: z.enum(["optional", "required", "disabled"]).optional(),
  CSH_ENCRYPTION_MODE: z.enum(["optional", "required", "disabled"]).optional(),
});

export type ContextVmConfig = {
  privateKey: string;
  relayUrls: string[];
  allowlistSeedPublicKeys: string[];
  encryptionMode: EncryptionMode;
  giftWrapMode: GiftWrapMode;
  serverInfo: {
    name: string;
    website?: string;
    about?: string;
  };
};

export function loadContextVmConfig(env: NodeJS.ProcessEnv = process.env): ContextVmConfig {
  const parsed = envSchema.parse(env);
  const privateKey = parsed.GW_PRIVATE_KEY ?? parsed.CSH_NOSTR_PRIVATE_KEY;
  const relaySource = parsed.CVM_RELAYS ?? parsed.CSH_NOSTR_RELAY_URLS;

  if (!privateKey) {
    throw new Error("Missing GW_PRIVATE_KEY or CSH_NOSTR_PRIVATE_KEY");
  }
  if (!relaySource) {
    throw new Error("Missing CVM_RELAYS or CSH_NOSTR_RELAY_URLS");
  }

  const allowlistSeedPublicKeys = parseCsvList(
    parsed.GW_ALLOWED_PUBLIC_KEYS ?? parsed.CSH_ALLOWED_PUBLIC_KEYS ?? "",
  );

  return {
    privateKey,
    relayUrls: parseCsvList(relaySource),
    allowlistSeedPublicKeys,
    encryptionMode: parseEncryptionMode(parsed.GW_ENCRYPTION_MODE ?? parsed.CSH_ENCRYPTION_MODE),
    giftWrapMode: GiftWrapMode.EPHEMERAL,
    serverInfo: {
      name: parsed.GW_SERVER_INFO_NAME || parsed.CSH_SERVER_NAME || "csh private shell",
      website: parsed.GW_SERVER_INFO_WEBSITE || parsed.CSH_SERVER_WEBSITE,
      about:
        parsed.CSH_SERVER_ABOUT ||
        "Private ContextVM shell gateway exposing the repo-local interactive csh MCP server.",
    },
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
      return EncryptionMode.OPTIONAL;
    case undefined:
      return EncryptionMode.REQUIRED;
    default:
      throw new Error(`Unsupported encryption mode: ${value}`);
  }
}
