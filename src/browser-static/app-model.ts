import { normalizeStoredSettings, profileToSettings, type BrowserProfile, type StoredBrowserSettings } from "./storage.js";

export type AuthStatusResult = {
  actorPubkey: string;
  allowlisted: boolean;
  serverName: string;
};

export type PreviewConfig = {
  defaultRelayUrls?: string[];
  defaultServerPubkey?: string;
  defaultSignerKind?: StoredBrowserSettings["signerKind"];
  enableTestSigner?: boolean;
  testSignerPrivateKey?: string;
  modeLabel?: string;
};

export const TERMINAL_MIRROR_LIMIT = 16_000;

export function resolveInitialSettings(
  preview: PreviewConfig,
  stored: StoredBrowserSettings | null,
): StoredBrowserSettings {
  return normalizeStoredSettings({
    relayUrls: stored?.relayUrls?.length ? stored.relayUrls : preview.defaultRelayUrls ?? [],
    serverPubkey: stored?.serverPubkey || preview.defaultServerPubkey || "",
    signerKind: stored?.signerKind || preview.defaultSignerKind || "nip07",
    bunkerConnectionUri: stored?.bunkerConnectionUri || "",
  });
}

export function shouldRedeemInvite(status: AuthStatusResult, inviteToken: string): boolean {
  return !status.allowlisted && inviteToken.trim().length > 0;
}

export function appendTerminalMirror(current: string, incoming: string): string {
  const combined = `${current}${incoming}`;
  if (combined.length <= TERMINAL_MIRROR_LIMIT) {
    return combined;
  }
  return combined.slice(-TERMINAL_MIRROR_LIMIT);
}

export function shouldStartWithExpandedSettings(initialSessionId: string | null): boolean {
  return initialSessionId === null;
}

export function applyProfileSelection(
  currentSettings: StoredBrowserSettings,
  profiles: BrowserProfile[],
  selectedLabel: string,
): StoredBrowserSettings {
  if (selectedLabel === "manual") {
    return currentSettings;
  }
  const profile = profiles.find((entry) => entry.label === selectedLabel);
  return profile ? profileToSettings(profile) : currentSettings;
}

export function resolveInitialSelectedProfileLabel(
  profiles: Array<{ label: string }>,
  storedLabel: string | null,
): string {
  if (!storedLabel) {
    return "manual";
  }
  return profiles.some((profile) => profile.label === storedLabel) ? storedLabel : "manual";
}
