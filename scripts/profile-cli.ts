import { loadConfig } from "./config";

export type BrowserProfileExport = {
  version: 1;
  label: string | null;
  relayUrls: string[];
  serverPubkey: string;
  preferredSignerKind: "nip07" | "test";
};

export async function exportProfile(
  configPath: string,
  options: {
    label?: string | null;
    env?: Record<string, string | undefined>;
    preferredSignerKind?: BrowserProfileExport["preferredSignerKind"];
  } = {},
): Promise<BrowserProfileExport> {
  const config = loadConfig(configPath);
  const env = options.env ?? process.env;
  const relayUrls = (env.CSH_BROWSER_RELAY_URLS || env.CVM_RELAYS)
    ? (env.CSH_BROWSER_RELAY_URLS || env.CVM_RELAYS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
    : [...config.relays];
  const serverPubkey = (env.CSH_BROWSER_SERVER_PUBKEY || env.CVM_SERVER_PUBKEY || config.serverPubkey).trim();
  return {
    version: 1,
    label: options.label ?? null,
    relayUrls,
    serverPubkey,
    preferredSignerKind: options.preferredSignerKind ?? "nip07",
  };
}
