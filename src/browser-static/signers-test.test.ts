import { describe, expect, test } from "bun:test";
import { createTestSigner } from "./signers-test";

describe("browser test signer", () => {
  test("derives a real pubkey from the preview private key", async () => {
    const signer = createTestSigner({
      privateKeyHex: "1".repeat(64),
    });

    const pubkey = await signer.getPublicKey();
    const ciphertext = await signer.nip44?.encrypt(pubkey, "hello");
    const plaintext = ciphertext ? await signer.nip44?.decrypt(pubkey, ciphertext) : undefined;
    expect(pubkey).toHaveLength(64);
    expect(await signer.signEvent({
      kind: 22242,
      created_at: 1_700_000_000,
      tags: [],
      content: "hello",
    })).toMatchObject({
      pubkey,
    });
    expect(typeof ciphertext).toBe("string");
    expect(plaintext).toBe("hello");
  });
});
