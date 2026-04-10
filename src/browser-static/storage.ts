export type BrowserSignerSelection = "nip07" | "bunker" | "amber" | "test";

export type StoredBrowserSettings = {
  relayUrls: string[];
  serverPubkey: string;
  signerKind: BrowserSignerSelection;
  bunkerConnectionUri: string;
};

export type BrowserProfile = {
  version: 1;
  label: string;
  relayUrls: string[];
  serverPubkey: string;
  preferredSignerKind: BrowserSignerSelection;
  bunkerConnectionUri: string;
};

const STORAGE_KEY = "csh.browser-static.settings.v1";
const PROFILE_STORAGE_KEY = "csh.browser-static.profiles.v1";
const SELECTED_PROFILE_STORAGE_KEY = "csh.browser-static.selected-profile.v1";

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

export function readStoredProfiles(storage: Pick<Storage, "getItem">): BrowserProfile[] {
  const raw = storage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((value) =>
      normalizeBrowserProfile({
        version: 1,
        label: typeof value.label === "string" ? value.label : "",
        relayUrls: Array.isArray(value.relayUrls) ? value.relayUrls.filter((item): item is string => typeof item === "string") : [],
        serverPubkey: typeof value.serverPubkey === "string" ? value.serverPubkey : "",
        preferredSignerKind:
          typeof value.preferredSignerKind === "string" ? value.preferredSignerKind : "nip07",
        bunkerConnectionUri:
          typeof value.bunkerConnectionUri === "string" ? value.bunkerConnectionUri : "",
      }),
    )
    .filter((value) => value.label.length > 0 && value.relayUrls.length > 0 && value.serverPubkey.length > 0);
}

export function upsertStoredProfile(
  storage: Pick<Storage, "getItem" | "setItem">,
  profile: BrowserProfile,
): BrowserProfile[] {
  const normalized = normalizeBrowserProfile(profile);
  const profiles = readStoredProfiles(storage).filter((entry) => entry.label !== normalized.label);
  profiles.push(normalized);
  profiles.sort((left, right) => left.label.localeCompare(right.label));
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  return profiles;
}

export function readSelectedProfileLabel(storage: Pick<Storage, "getItem">): string | null {
  return storage.getItem(SELECTED_PROFILE_STORAGE_KEY);
}

export function writeSelectedProfileLabel(
  storage: Pick<Storage, "setItem">,
  label: string,
): void {
  storage.setItem(SELECTED_PROFILE_STORAGE_KEY, label.trim());
}

export function clearSelectedProfileLabel(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(SELECTED_PROFILE_STORAGE_KEY);
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

export function importBrowserProfile(raw: string): BrowserProfile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Profile import must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Profile import must be a JSON object");
  }

  const value = parsed as Record<string, unknown>;
  const label =
    typeof value.label === "string" && value.label.trim().length > 0
      ? value.label
      : typeof value.serverPubkey === "string"
        ? `server:${value.serverPubkey.slice(0, 12)}`
        : "";

  return normalizeBrowserProfile({
    version: 1,
    label,
    relayUrls: Array.isArray(value.relayUrls) ? value.relayUrls.filter((item): item is string => typeof item === "string") : [],
    serverPubkey: typeof value.serverPubkey === "string" ? value.serverPubkey : "",
    preferredSignerKind:
      typeof value.preferredSignerKind === "string" ? value.preferredSignerKind as BrowserSignerSelection : "nip07",
    bunkerConnectionUri:
      typeof value.bunkerConnectionUri === "string" ? value.bunkerConnectionUri : "",
  });
}

export function profileToSettings(profile: BrowserProfile): StoredBrowserSettings {
  return normalizeStoredSettings({
    relayUrls: profile.relayUrls,
    serverPubkey: profile.serverPubkey,
    signerKind: profile.preferredSignerKind,
    bunkerConnectionUri: profile.bunkerConnectionUri,
  });
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

function normalizeBrowserProfile(input: BrowserProfile): BrowserProfile {
  const label = input.label.trim();
  const relayUrls = dedupeRelayUrls(input.relayUrls);
  const serverPubkey = input.serverPubkey.trim().toLowerCase();
  if (!label) {
    throw new Error("Browser profile label is required");
  }
  if (relayUrls.length === 0) {
    throw new Error("Browser profile requires at least one relay URL");
  }
  if (!serverPubkey) {
    throw new Error("Browser profile requires a server pubkey");
  }
  return {
    version: 1,
    label,
    relayUrls,
    serverPubkey,
    preferredSignerKind: normalizeSignerKind(input.preferredSignerKind),
    bunkerConnectionUri: input.bunkerConnectionUri.trim(),
  };
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
