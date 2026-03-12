import { z } from "zod";

const envSchema = z.object({
  CSH_NOSTR_PRIVATE_KEY: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{64}$/, "CSH_NOSTR_PRIVATE_KEY must be a 64-character hex private key"),
  CSH_NOSTR_RELAY_URLS: z
    .string()
    .trim()
    .min(1, "CSH_NOSTR_RELAY_URLS must contain at least one relay URL"),
  CSH_ALLOWED_PUBLIC_KEYS: z
    .string()
    .trim()
    .min(1, "CSH_ALLOWED_PUBLIC_KEYS must contain at least one allowed client pubkey"),
  CSH_SERVER_NAME: z.string().trim().optional(),
  CSH_SERVER_WEBSITE: z.string().trim().optional(),
  CSH_SERVER_ABOUT: z.string().trim().optional(),
});

export type ContextVmConfig = {
  privateKey: string;
  relayUrls: string[];
  allowedPublicKeys: string[];
  serverInfo: {
    name: string;
    website?: string;
    about?: string;
  };
};

export function loadContextVmConfig(env: NodeJS.ProcessEnv = process.env): ContextVmConfig {
  const parsed = envSchema.parse(env);

  return {
    privateKey: parsed.CSH_NOSTR_PRIVATE_KEY,
    relayUrls: parseCsvList(parsed.CSH_NOSTR_RELAY_URLS),
    allowedPublicKeys: parseCsvList(parsed.CSH_ALLOWED_PUBLIC_KEYS),
    serverInfo: {
      name: parsed.CSH_SERVER_NAME || "csh private shell",
      website: parsed.CSH_SERVER_WEBSITE,
      about:
        parsed.CSH_SERVER_ABOUT ||
        "Private ContextVM shell gateway exposing the local csh MCP server.",
    },
  };
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
