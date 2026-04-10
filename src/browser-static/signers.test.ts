import { describe, expect, test } from "bun:test";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";
import {
  createAmberSigner,
  createBunkerSignerAdapter,
  createNip07Signer,
} from "./signers";
import { createTestSigner } from "./signers-test";

const PUBKEY = "a".repeat(64);
const EVENT_TEMPLATE: EventTemplate = {
  kind: 22242,
  created_at: 1_700_000_000,
  tags: [["t", "csh"]],
  content: "hello",
};

describe("browser signer adapters", () => {
  test("wraps NIP-07 providers", async () => {
    const signedEvent = signed(EVENT_TEMPLATE, PUBKEY);
    const nip44Decrypt = async (pubkey: string, ciphertext: string) => `${pubkey}:${ciphertext}:plain`;
    const signer = createNip07Signer({
      async getPublicKey() {
        return PUBKEY;
      },
      async signEvent(event) {
        expect(event).toEqual(EVENT_TEMPLATE);
        return signedEvent;
      },
      nip44: {
        async encrypt(pubkey, plaintext) {
          return `${pubkey}:${plaintext}:cipher`;
        },
        async decrypt(pubkey, ciphertext) {
          return await nip44Decrypt(pubkey, ciphertext);
        },
      },
    });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    await expect(signer.signEvent(EVENT_TEMPLATE)).resolves.toEqual(signedEvent);
    await expect(signer.nip44?.decrypt(PUBKEY, "cipher")).resolves.toBe(`${PUBKEY}:cipher:plain`);
  });

  test("rejects missing NIP-07 providers", () => {
    expect(() => createNip07Signer(undefined)).toThrow(/unavailable/);
  });

  test("wraps bunker signers through the injected factory", async () => {
    const signedEvent = signed(EVENT_TEMPLATE, PUBKEY);
    const signer = await createBunkerSignerAdapter({
      connectionUri: "bunker://example",
      clientSecretKeyHex: "1".repeat(64),
      signerFactory: async (input) => {
        expect(input.connectionUri).toBe("bunker://example");
        expect(input.clientSecretKeyHex).toBe("1".repeat(64));
        return {
          async getPublicKey() {
            return PUBKEY;
          },
          async signEvent(event) {
            expect(event).toEqual(EVENT_TEMPLATE);
            return signedEvent;
          },
          async nip44Encrypt(pubkey, plaintext) {
            return `${pubkey}:${plaintext}:cipher`;
          },
          async nip44Decrypt(pubkey, ciphertext) {
            return `${pubkey}:${ciphertext}:plain`;
          },
        };
      },
    });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    await expect(signer.signEvent(EVENT_TEMPLATE)).resolves.toEqual(signedEvent);
    await expect(signer.nip44?.decrypt(PUBKEY, "cipher")).resolves.toBe(`${PUBKEY}:cipher:plain`);
  });

  test("builds amber deeplink requests and parses responses", async () => {
    const seenUris: string[] = [];
    const signer = createAmberSigner({
      appName: "csh",
      bridge: {
        async request(uri) {
          seenUris.push(uri);
          if (uri.includes("type=get_public_key")) {
            return JSON.stringify({ pubkey: PUBKEY });
          }
          if (uri.includes("type=nip44_encrypt")) {
            return JSON.stringify({ encryptedText: "ciphertext" });
          }
          if (uri.includes("type=nip44_decrypt")) {
            return JSON.stringify({ plainText: "plaintext" });
          }
          return JSON.stringify(signed(EVENT_TEMPLATE, PUBKEY));
        },
      },
    });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    await expect(signer.signEvent(EVENT_TEMPLATE)).resolves.toEqual(signed(EVENT_TEMPLATE, PUBKEY));
    await expect(signer.nip44?.encrypt(PUBKEY, "plaintext")).resolves.toBe("ciphertext");
    await expect(signer.nip44?.decrypt(PUBKEY, "ciphertext")).resolves.toBe("plaintext");
    expect(seenUris[0]).toContain("nostrsigner:");
    expect(seenUris[0]).toContain("type=get_public_key");
    expect(seenUris[1]).toContain("type=sign_event");
    expect(seenUris[2]).toContain("type=nip44_encrypt");
    expect(seenUris[3]).toContain("type=nip44_decrypt");
  });

  test("provides a deterministic test signer", async () => {
    const signer = createTestSigner({
      privateKeyHex: "1".repeat(64),
      signEvent: async (event) => signed(event, PUBKEY),
    });
    const signedEvent = await signer.signEvent(EVENT_TEMPLATE);
    const ciphertext = await signer.nip44?.encrypt(PUBKEY, "hello");

    expect(await signer.getPublicKey()).toHaveLength(64);
    expect(signedEvent.pubkey).toBe(PUBKEY);
    expect(typeof ciphertext).toBe("string");
  });
});

function signed(event: EventTemplate, pubkey: string): VerifiedEvent {
  return {
    ...event,
    id: "signed-event-id",
    pubkey,
    sig: "signed-event-signature",
  };
}
