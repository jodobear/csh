import { PrivateKeySigner } from "@contextvm/sdk";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";
import type { BrowserSigner } from "./signers";

export function createTestSigner(input: {
  privateKeyHex: string;
  label?: string;
  signEvent?: (event: EventTemplate) => Promise<VerifiedEvent>;
}): BrowserSigner {
  const signer = new PrivateKeySigner(input.privateKeyHex);
  const baseSignEvent = signer.signEvent.bind(signer);
  return Object.assign(signer, {
    kind: "test" as const,
    label: input.label ?? "Test signer",
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      if (input.signEvent) {
        return await input.signEvent(event);
      }
      return await baseSignEvent(event);
    },
  });
}
