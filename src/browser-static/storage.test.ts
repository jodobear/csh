import { describe, expect, test } from "bun:test";
import {
  clearSelectedProfileLabel,
  clearStoredSettings,
  deriveStateNamespace,
  deriveSessionStateNamespace,
  importBrowserProfile,
  normalizeStoredSettings,
  profileToSettings,
  readStoredSettings,
  readStoredProfiles,
  readSelectedProfileLabel,
  upsertStoredProfile,
  writeStoredSettings,
  writeSelectedProfileLabel,
} from "./storage";

describe("browser static storage", () => {
  test("normalizes relay URLs, signer kind, and server pubkey before persisting", () => {
    const storage = createMemoryStorage();
    const written = writeStoredSettings(storage, {
      relayUrls: [" wss://relay.example ", "wss://relay.example", "wss://second.example"],
      serverPubkey: "ABCD",
      signerKind: "invalid" as never,
      bunkerConnectionUri: "  bunker://remote  ",
    });

    expect(written).toEqual({
      relayUrls: ["wss://relay.example", "wss://second.example"],
      serverPubkey: "abcd",
      signerKind: "nip07",
      bunkerConnectionUri: "bunker://remote",
    });
  });

  test("reads valid settings and ignores invalid json payloads", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "csh.browser-static.settings.v1",
      JSON.stringify({
        relayUrls: ["wss://relay.example"],
        serverPubkey: "a".repeat(64),
        signerKind: "bunker",
        bunkerConnectionUri: "bunker://remote",
      }),
    );

    expect(readStoredSettings(storage)).toEqual({
      relayUrls: ["wss://relay.example"],
      serverPubkey: "a".repeat(64),
      signerKind: "bunker",
      bunkerConnectionUri: "bunker://remote",
    });

    storage.setItem("csh.browser-static.settings.v1", "{broken");
    expect(readStoredSettings(storage)).toBeNull();
  });

  test("clears settings and derives deterministic state namespaces", () => {
    const storage = createMemoryStorage();
    writeStoredSettings(storage, {
      relayUrls: ["wss://relay.example"],
      serverPubkey: "a".repeat(64),
      signerKind: "nip07",
      bunkerConnectionUri: "",
    });
    clearStoredSettings(storage);
    expect(readStoredSettings(storage)).toBeNull();

    expect(
      deriveStateNamespace({
        relayUrls: ["wss://relay.example", "wss://relay.example", "wss://second.example"],
        serverPubkey: "A".repeat(64),
      }),
    ).toBe(`static:${"a".repeat(64)}:wss://relay.example,wss://second.example`);

    expect(
      deriveSessionStateNamespace({
        relayUrls: ["wss://relay.example", "wss://relay.example", "wss://second.example"],
        serverPubkey: "A".repeat(64),
        actorPubkey: "B".repeat(64),
      }),
    ).toBe(`static:${"a".repeat(64)}:wss://relay.example,wss://second.example:${"b".repeat(64)}`);
  });

  test("imports, persists, and selects named browser profiles", () => {
    const storage = createMemoryStorage();
    const imported = importBrowserProfile(
      JSON.stringify({
        version: 1,
        label: "Private Relay",
        relayUrls: [" ws://127.0.0.1:10552 ", "ws://127.0.0.1:10552"],
        serverPubkey: "A".repeat(64),
        preferredSignerKind: "nip07",
      }),
    );
    upsertStoredProfile(storage, imported);
    writeSelectedProfileLabel(storage, imported.label);

    expect(readStoredProfiles(storage)).toEqual([{
      version: 1,
      label: "Private Relay",
      relayUrls: ["ws://127.0.0.1:10552"],
      serverPubkey: "a".repeat(64),
      preferredSignerKind: "nip07",
      bunkerConnectionUri: "",
    }]);
    expect(readSelectedProfileLabel(storage)).toBe("Private Relay");
    expect(profileToSettings(imported)).toEqual({
      relayUrls: ["ws://127.0.0.1:10552"],
      serverPubkey: "a".repeat(64),
      signerKind: "nip07",
      bunkerConnectionUri: "",
    });

    clearSelectedProfileLabel(storage);
    expect(readSelectedProfileLabel(storage)).toBeNull();
  });
});

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}
