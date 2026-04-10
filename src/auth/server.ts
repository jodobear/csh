import { AuthStateStore, type AuthStatus } from "./state.js";

type EnvLike = Pick<
  NodeJS.ProcessEnv,
  | "CSH_ALLOW_UNAUTHENTICATED_OWNER"
  | "CSH_FORCED_OWNER_ID"
  | "GW_ALLOWED_PUBLIC_KEYS"
  | "CSH_ALLOWED_PUBLIC_KEYS"
  | "GW_SERVER_INFO_NAME"
  | "CSH_SERVER_NAME"
>;

export type ResolvedSessionActor = {
  actorId: string;
  authenticatedPubkey: string | null;
  bypassAllowlist: boolean;
};

export type AuthStatusResult = AuthStatus & {
  serverName: string;
};

export class AuthService {
  private initializePromise: Promise<void> | null = null;

  constructor(
    private readonly store = new AuthStateStore(),
    private readonly env: EnvLike = process.env,
  ) {}

  async authStatus(extra: unknown): Promise<AuthStatusResult> {
    await this.initialize();
    const actorPubkey = resolveAuthenticatedPubkey(extra, this.env);
    const status = await this.store.authStatus(actorPubkey);
    return {
      ...status,
      serverName: resolveServerName(this.env),
    };
  }

  async redeemInvite(inviteToken: string, extra: unknown): Promise<AuthStatusResult> {
    await this.initialize();
    const actorPubkey = resolveAuthenticatedPubkey(extra, this.env);
    await this.store.redeemInvite(actorPubkey, inviteToken);
    const status = await this.store.authStatus(actorPubkey);
    return {
      ...status,
      serverName: resolveServerName(this.env),
    };
  }

  async resolveShellActorId(requestedOwnerId: string | undefined, extra: unknown): Promise<string> {
    await this.initialize();
    const actor = resolveSessionActor(requestedOwnerId, extra, this.env);
    if (actor.bypassAllowlist || actor.authenticatedPubkey === null) {
      return actor.actorId;
    }

    const isAllowlisted = await this.store.isAllowlisted(actor.authenticatedPubkey);
    if (!isAllowlisted) {
      throw new Error("Authenticated signer is not allowlisted for shell access");
    }

    return actor.actorId;
  }

  private async initialize(): Promise<void> {
    if (this.initializePromise === null) {
      this.initializePromise = this.store.initializeWithSeedPubkeys(loadAllowlistSeedPubkeys(this.env));
    }
    await this.initializePromise;
  }
}

export function resolveSessionActor(
  requestedOwnerId: string | undefined,
  extra: unknown,
  env: EnvLike = process.env,
): ResolvedSessionActor {
  const forcedOwnerId = env.CSH_FORCED_OWNER_ID?.trim() || undefined;
  const metadataOwnerId = extractClientPubkey(extra);

  if (forcedOwnerId) {
    if (requestedOwnerId && requestedOwnerId !== forcedOwnerId) {
      throw new Error("ownerId does not match the enforced server-side identity");
    }

    return {
      actorId: forcedOwnerId,
      authenticatedPubkey: isValidPubkey(forcedOwnerId) ? forcedOwnerId : null,
      bypassAllowlist: !isValidPubkey(forcedOwnerId),
    };
  }

  if (metadataOwnerId && requestedOwnerId && requestedOwnerId !== metadataOwnerId) {
    throw new Error("ownerId does not match the authenticated client identity");
  }

  if (metadataOwnerId) {
    return {
      actorId: metadataOwnerId,
      authenticatedPubkey: metadataOwnerId,
      bypassAllowlist: false,
    };
  }

  if (env.CSH_ALLOW_UNAUTHENTICATED_OWNER === "1") {
    return {
      actorId: requestedOwnerId ?? "local",
      authenticatedPubkey: null,
      bypassAllowlist: true,
    };
  }

  throw new Error("Authenticated client identity is required for session access");
}

export function resolveAuthenticatedPubkey(extra: unknown, env: EnvLike = process.env): string {
  const metadataOwnerId = extractClientPubkey(extra);
  if (metadataOwnerId) {
    return metadataOwnerId;
  }

  const forcedOwnerId = env.CSH_FORCED_OWNER_ID?.trim() || undefined;
  if (forcedOwnerId && isValidPubkey(forcedOwnerId)) {
    return forcedOwnerId;
  }

  throw new Error("Authenticated Nostr signer is required");
}

export function loadAllowlistSeedPubkeys(env: EnvLike = process.env): string[] {
  return [
    ...(env.GW_ALLOWED_PUBLIC_KEYS ? parseCsvList(env.GW_ALLOWED_PUBLIC_KEYS) : []),
    ...(env.CSH_ALLOWED_PUBLIC_KEYS ? parseCsvList(env.CSH_ALLOWED_PUBLIC_KEYS) : []),
  ];
}

function resolveServerName(env: EnvLike): string {
  return env.GW_SERVER_INFO_NAME?.trim() || env.CSH_SERVER_NAME?.trim() || "csh private shell";
}

function parseCsvList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function extractClientPubkey(extra: unknown): string | undefined {
  return typeof extra === "object" &&
    extra !== null &&
    "_meta" in extra &&
    typeof extra._meta === "object" &&
    extra._meta !== null &&
    "clientPubkey" in extra._meta &&
    typeof extra._meta.clientPubkey === "string"
    ? extra._meta.clientPubkey
    : undefined;
}

function isValidPubkey(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
