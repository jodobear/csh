import { PrivateKeySigner } from "@contextvm/sdk";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";
import type { BrowserSigner } from "./signers";

export function createTestSigner(input: {
  privateKeyHex: string;
  label?: string;
  signEvent?: (event: EventTemplate) => Promise<VerifiedEvent>;
}): BrowserSigner {
  const signer = new PrivateKeySigner(input.privateKeyHex);
  return {
    kind: "test",
    label: input.label ?? "Test signer",
    async getPublicKey(): Promise<string> {
      return await signer.getPublicKey();
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      if (input.signEvent) {
        return await input.signEvent(event);
      }
      return await signer.signEvent(event);
    },
  };
}
