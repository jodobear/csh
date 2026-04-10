export type BrowserSignerSelection = "nip07" | "bunker" | "amber" | "test";

export type StoredBrowserSettings = {
  relayUrls: string[];
  serverPubkey: string;
  signerKind: BrowserSignerSelection;
  bunkerConnectionUri: string;
};

const STORAGE_KEY = "csh.browser-static.settings.v1";

export function readStoredSettings(storage: Pick<Storage, "getItem">): StoredBrowserSettings | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const value = parsed as Partial<StoredBrowserSettings>;
  return normalizeStoredSettings({
    relayUrls: Array.isArray(value.relayUrls) ? value.relayUrls : [],
    serverPubkey: typeof value.serverPubkey === "string" ? value.serverPubkey : "",
    signerKind: typeof value.signerKind === "string" ? value.signerKind : "nip07",
    bunkerConnectionUri:
      typeof value.bunkerConnectionUri === "string" ? value.bunkerConnectionUri : "",
  });
}

export function writeStoredSettings(
  storage: Pick<Storage, "setItem">,
  value: StoredBrowserSettings,
): StoredBrowserSettings {
  const normalized = normalizeStoredSettings(value);
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearStoredSettings(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(STORAGE_KEY);
}

export function normalizeStoredSettings(input: StoredBrowserSettings): StoredBrowserSettings {
  const signerKind = normalizeSignerKind(input.signerKind);
  return {
    relayUrls: dedupeRelayUrls(input.relayUrls),
    serverPubkey: input.serverPubkey.trim().toLowerCase(),
    signerKind,
    bunkerConnectionUri: input.bunkerConnectionUri.trim(),
  };
}

export function deriveStateNamespace(input: {
  relayUrls: string[];
  serverPubkey: string;
}): string {
  return `static:${input.serverPubkey.trim().toLowerCase()}:${dedupeRelayUrls(input.relayUrls).join(",")}`;
}

export function deriveSessionStateNamespace(input: {
  relayUrls: string[];
  serverPubkey: string;
  actorPubkey: string;
}): string {
  return `${deriveStateNamespace(input)}:${input.actorPubkey.trim().toLowerCase()}`;
}

function normalizeSignerKind(value: string): BrowserSignerSelection {
  switch (value) {
    case "nip07":
    case "bunker":
    case "amber":
    case "test":
      return value;
    default:
      return "nip07";
  }
}

function dedupeRelayUrls(relayUrls: string[]): string[] {
  const deduped = new Set<string>();
  for (const relayUrl of relayUrls) {
    const trimmed = relayUrl.trim();
    if (trimmed.length > 0) {
      deduped.add(trimmed);
    }
  }
  return [...deduped];
}
