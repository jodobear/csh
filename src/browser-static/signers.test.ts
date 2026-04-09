import { describe, expect, test } from "bun:test";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";
import {
  createAmberSigner,
  createBunkerSignerAdapter,
  createNip07Signer,
  createTestSigner,
} from "./signers";

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
    const signer = createNip07Signer({
      async getPublicKey() {
        return PUBKEY;
      },
      async signEvent(event) {
        expect(event).toEqual(EVENT_TEMPLATE);
        return signedEvent;
      },
    });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    await expect(signer.signEvent(EVENT_TEMPLATE)).resolves.toEqual(signedEvent);
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
        };
      },
    });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    await expect(signer.signEvent(EVENT_TEMPLATE)).resolves.toEqual(signedEvent);
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
          return JSON.stringify(signed(EVENT_TEMPLATE, PUBKEY));
        },
      },
    });

    await expect(signer.getPublicKey()).resolves.toBe(PUBKEY);
    await expect(signer.signEvent(EVENT_TEMPLATE)).resolves.toEqual(signed(EVENT_TEMPLATE, PUBKEY));
    expect(seenUris[0]).toContain("nostrsigner:");
    expect(seenUris[0]).toContain("type=get_public_key");
    expect(seenUris[1]).toContain("type=sign_event");
  });

  test("provides a deterministic test signer", async () => {
    const signer = createTestSigner({ pubkey: PUBKEY });
    const signedEvent = await signer.signEvent(EVENT_TEMPLATE);

    expect(await signer.getPublicKey()).toBe(PUBKEY);
    expect(signedEvent.pubkey).toBe(PUBKEY);
    expect(signedEvent.id).toBe("test-event-id");
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
