import { BunkerSigner } from "nostr-tools/nip46";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";

export type BrowserSignerKind = "nip07" | "bunker" | "amber" | "test";

export type BrowserSigner = {
  kind: BrowserSignerKind;
  label: string;
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
};

export type NostrBrowserProvider = {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
};

export type BunkerSignerFactory = (input: {
  connectionUri: string;
  clientSecretKeyHex: string;
}) => Promise<Pick<BrowserSigner, "getPublicKey" | "signEvent">>;

export type AmberBridge = {
  request(uri: string): Promise<string | VerifiedEvent>;
};

export function createNip07Signer(provider: NostrBrowserProvider | undefined): BrowserSigner {
  if (!provider || typeof provider.getPublicKey !== "function" || typeof provider.signEvent !== "function") {
    throw new Error("NIP-07 signer is unavailable");
  }

  return {
    kind: "nip07",
    label: "NIP-07",
    async getPublicKey(): Promise<string> {
      return await provider.getPublicKey();
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      return await provider.signEvent(event);
    },
  };
}

export async function createBunkerSignerAdapter(input: {
  connectionUri: string;
  clientSecretKeyHex: string;
  signerFactory?: BunkerSignerFactory;
}): Promise<BrowserSigner> {
  const signerFactory = input.signerFactory ?? defaultBunkerSignerFactory;
  const signer = await signerFactory({
    connectionUri: input.connectionUri,
    clientSecretKeyHex: input.clientSecretKeyHex,
  });

  return {
    kind: "bunker",
    label: "Bunker",
    async getPublicKey(): Promise<string> {
      return await signer.getPublicKey();
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      return await signer.signEvent(event);
    },
  };
}

export function createAmberSigner(input: {
  bridge: AmberBridge;
  appName?: string;
  currentUser?: string;
}): BrowserSigner {
  return {
    kind: "amber",
    label: "Amber",
    async getPublicKey(): Promise<string> {
      const response = await input.bridge.request(
        buildNip55GetPublicKeyUri({
          permissions: [{ type: "sign_event" }],
          appName: input.appName,
          currentUser: input.currentUser,
        }),
      );
      return normalizeAmberPublicKeyResponse(response);
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      const response = await input.bridge.request(
        buildNip55SignEventUri({
          eventJson: event as unknown as Record<string, unknown>,
          appName: input.appName,
          currentUser: input.currentUser,
        }),
      );
      return normalizeAmberSignedEvent(response);
    },
  };
}

export function createTestSigner(input: {
  pubkey: string;
  signEvent?: (event: EventTemplate) => Promise<VerifiedEvent>;
}): BrowserSigner {
  return {
    kind: "test",
    label: "Test signer",
    async getPublicKey(): Promise<string> {
      return input.pubkey;
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      if (input.signEvent) {
        return await input.signEvent(event);
      }

      return {
        ...event,
        id: "test-event-id",
        pubkey: input.pubkey,
        sig: "test-signature",
      };
    },
  };
}

async function defaultBunkerSignerFactory(input: {
  connectionUri: string;
  clientSecretKeyHex: string;
}): Promise<Pick<BrowserSigner, "getPublicKey" | "signEvent">> {
  const signer = await BunkerSigner.fromURI(
    decodeHex(input.clientSecretKeyHex),
    input.connectionUri,
  );
  return {
    async getPublicKey(): Promise<string> {
      return await signer.getPublicKey();
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      return await signer.signEvent(event);
    },
  };
}

function normalizeAmberPublicKeyResponse(response: string | VerifiedEvent): string {
  if (typeof response === "string") {
    const parsed = safeJsonParse(response);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "pubkey" in parsed && typeof parsed.pubkey === "string") {
      return parsed.pubkey;
    }
    return response;
  }

  return response.pubkey;
}

function normalizeAmberSignedEvent(response: string | VerifiedEvent): VerifiedEvent {
  if (typeof response === "string") {
    const parsed = safeJsonParse(response);
    if (parsed && typeof parsed === "object") {
      return parsed as VerifiedEvent;
    }
    throw new Error("Amber signer returned an invalid signed event payload");
  }

  return response;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function buildNip55GetPublicKeyUri(input: {
  permissions: Array<{ type: string; kind?: number }>;
  appName?: string;
  currentUser?: string;
}): string {
  return buildUri("nostrsigner:", "get_public_key", {
    permissions:
      input.permissions.length > 0 ? encodeURIComponent(JSON.stringify(input.permissions)) : undefined,
    appName: input.appName,
    current_user: input.currentUser,
    compressionType: "none",
    returnType: "signature",
  });
}

function buildNip55SignEventUri(input: {
  eventJson: Record<string, unknown>;
  appName?: string;
  currentUser?: string;
}): string {
  return buildUri(
    `nostrsigner:${encodeURIComponent(JSON.stringify(input.eventJson))}`,
    "sign_event",
    {
      appName: input.appName,
      current_user: input.currentUser,
      compressionType: "none",
      returnType: "event",
    },
  );
}

function buildUri(base: string, type: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams(
    Object.entries({
      type,
      ...params,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return `${base}?${search.toString()}`;
}

function decodeHex(value: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Bunker client secret must be a 64-character hex private key");
  }

  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}
