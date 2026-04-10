import { BunkerSigner } from "nostr-tools/nip46";
import type { EventTemplate, VerifiedEvent } from "nostr-tools";

export type BrowserSignerKind = "nip07" | "bunker" | "amber" | "test";

type BrowserEncryptionApi = {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
};

export type BrowserSigner = {
  kind: BrowserSignerKind;
  label: string;
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
  nip04?: BrowserEncryptionApi;
  nip44?: BrowserEncryptionApi;
};

export type NostrBrowserProvider = {
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
  nip04?: BrowserEncryptionApi;
  nip44?: BrowserEncryptionApi;
};

export type BunkerSignerFactory = (input: {
  connectionUri: string;
  clientSecretKeyHex: string;
}) => Promise<{
  getPublicKey(): Promise<string>;
  signEvent(event: EventTemplate): Promise<VerifiedEvent>;
  nip04Encrypt?(pubkey: string, plaintext: string): Promise<string>;
  nip04Decrypt?(pubkey: string, ciphertext: string): Promise<string>;
  nip44Encrypt?(pubkey: string, plaintext: string): Promise<string>;
  nip44Decrypt?(pubkey: string, ciphertext: string): Promise<string>;
}>;

export type AmberBridge = {
  request(uri: string): Promise<string | VerifiedEvent>;
};

export function createNip07Signer(provider: NostrBrowserProvider | undefined): BrowserSigner {
  if (!provider || typeof provider.getPublicKey !== "function" || typeof provider.signEvent !== "function") {
    throw new Error("NIP-07 signer is unavailable");
  }

  const signer: BrowserSigner = {
    kind: "nip07",
    label: "NIP-07",
    async getPublicKey(): Promise<string> {
      return await provider.getPublicKey();
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      return await provider.signEvent(event);
    },
  };
  if (provider.nip04) {
    signer.nip04 = provider.nip04;
  }
  if (provider.nip44) {
    signer.nip44 = provider.nip44;
  }
  return signer;
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
    ...(signer.nip04Encrypt && signer.nip04Decrypt
      ? {
          nip04: {
            encrypt: async (pubkey: string, plaintext: string) =>
              await signer.nip04Encrypt!(pubkey, plaintext),
            decrypt: async (pubkey: string, ciphertext: string) =>
              await signer.nip04Decrypt!(pubkey, ciphertext),
          },
        }
      : {}),
    ...(signer.nip44Encrypt && signer.nip44Decrypt
      ? {
          nip44: {
            encrypt: async (pubkey: string, plaintext: string) =>
              await signer.nip44Encrypt!(pubkey, plaintext),
            decrypt: async (pubkey: string, ciphertext: string) =>
              await signer.nip44Decrypt!(pubkey, ciphertext),
          },
        }
      : {}),
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
        buildGetPublicKeyUri({
          permissions: [{ type: "sign_event" }],
          appName: input.appName,
          currentUser: input.currentUser,
        }),
      );
      return normalizeAmberPublicKeyResponse(response);
    },
    async signEvent(event: EventTemplate): Promise<VerifiedEvent> {
      const response = await input.bridge.request(
        buildSignEventUri({
          eventJson: event as unknown as Record<string, unknown>,
          appName: input.appName,
          currentUser: input.currentUser,
        }),
      );
      return normalizeAmberSignedEvent(response);
    },
    nip04: {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> =>
        normalizeAmberCiphertextResponse(
          await input.bridge.request(
            buildEncryptUri("nip04_encrypt", {
              pubKey: pubkey,
              content: plaintext,
              appName: input.appName,
              currentUser: input.currentUser,
            }),
          ),
        ),
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> =>
        normalizeAmberPlaintextResponse(
          await input.bridge.request(
            buildDecryptUri("nip04_decrypt", {
              pubKey: pubkey,
              content: ciphertext,
              appName: input.appName,
              currentUser: input.currentUser,
            }),
          ),
        ),
    },
    nip44: {
      encrypt: async (pubkey: string, plaintext: string): Promise<string> =>
        normalizeAmberCiphertextResponse(
          await input.bridge.request(
            buildEncryptUri("nip44_encrypt", {
              pubKey: pubkey,
              content: plaintext,
              appName: input.appName,
              currentUser: input.currentUser,
            }),
          ),
        ),
      decrypt: async (pubkey: string, ciphertext: string): Promise<string> =>
        normalizeAmberPlaintextResponse(
          await input.bridge.request(
            buildDecryptUri("nip44_decrypt", {
              pubKey: pubkey,
              content: ciphertext,
              appName: input.appName,
              currentUser: input.currentUser,
            }),
          ),
        ),
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

function normalizeAmberCiphertextResponse(response: string | VerifiedEvent): string {
  if (typeof response === "string") {
    const parsed = safeJsonParse(response);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const encryptedText =
        ("encryptedText" in parsed && typeof parsed.encryptedText === "string" && parsed.encryptedText) ||
        ("ciphertext" in parsed && typeof parsed.ciphertext === "string" && parsed.ciphertext) ||
        ("content" in parsed && typeof parsed.content === "string" && parsed.content);
      if (encryptedText) {
        return encryptedText;
      }
    }
    return response;
  }
  if (typeof response.content === "string") {
    return response.content;
  }
  throw new Error("Amber signer returned an invalid encrypted payload");
}

function normalizeAmberPlaintextResponse(response: string | VerifiedEvent): string {
  if (typeof response === "string") {
    const parsed = safeJsonParse(response);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      const plaintext =
        ("plainText" in parsed && typeof parsed.plainText === "string" && parsed.plainText) ||
        ("plaintext" in parsed && typeof parsed.plaintext === "string" && parsed.plaintext) ||
        ("content" in parsed && typeof parsed.content === "string" && parsed.content);
      if (plaintext) {
        return plaintext;
      }
    }
    return response;
  }
  if (typeof response.content === "string") {
    return response.content;
  }
  throw new Error("Amber signer returned an invalid decrypted payload");
}

function buildGetPublicKeyUri(input: {
  permissions: Array<{ type: string; kind?: number }>;
  appName?: string;
  currentUser?: string;
}): string {
  return buildUri({
    base: "nostrsigner:",
    type: "get_public_key",
    appName: input.appName,
    currentUser: input.currentUser,
    permissions: input.permissions,
    returnType: "signature",
  });
}

function buildSignEventUri(input: {
  eventJson: Record<string, unknown>;
  appName?: string;
  currentUser?: string;
}): string {
  return buildUri({
    base: `nostrsigner:${encodeURIComponent(JSON.stringify(input.eventJson))}`,
    type: "sign_event",
    appName: input.appName,
    currentUser: input.currentUser,
    returnType: "event",
  });
}

function buildEncryptUri(
  type: "nip04_encrypt" | "nip44_encrypt",
  input: {
    pubKey: string;
    content: string;
    appName?: string;
    currentUser?: string;
  },
): string {
  return buildUri({
    base: "nostrsigner:",
    type,
    appName: input.appName,
    currentUser: input.currentUser,
    pubKey: input.pubKey,
    plainText: input.content,
    returnType: "signature",
  });
}

function buildDecryptUri(
  type: "nip04_decrypt" | "nip44_decrypt",
  input: {
    pubKey: string;
    content: string;
    appName?: string;
    currentUser?: string;
  },
): string {
  return buildUri({
    base: "nostrsigner:",
    type,
    appName: input.appName,
    currentUser: input.currentUser,
    pubKey: input.pubKey,
    encryptedText: input.content,
    returnType: "signature",
  });
}

function buildUri(input: {
  base: string;
  type: string;
  appName?: string;
  currentUser?: string;
  permissions?: Array<{ type: string; kind?: number }>;
  pubKey?: string;
  plainText?: string;
  encryptedText?: string;
  returnType: "signature" | "event";
}): string {
  const params = new URLSearchParams(
    Object.entries({
      type: input.type,
      compressionType: "none",
      returnType: input.returnType,
      appName: input.appName,
      current_user: input.currentUser,
      permissions:
        input.permissions && input.permissions.length > 0
          ? encodeURIComponent(JSON.stringify(input.permissions))
          : undefined,
      pubKey: input.pubKey,
      plainText: input.plainText,
      encryptedText: input.encryptedText,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return `${input.base}?${params.toString()}`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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
