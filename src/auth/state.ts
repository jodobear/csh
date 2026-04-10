import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_AUTH_STATE_DIR =
  process.env.CSH_AUTH_STATE_DIR ?? path.join(PROJECT_ROOT, ".csh-runtime", "auth");

export type AllowlistEntry = {
  pubkey: string;
  label: string | null;
  source: "env" | "admin" | "invite";
  createdAt: string;
  invitedByTokenId: string | null;
};

export type InviteEntry = {
  id: string;
  tokenHash: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  redeemedAt: string | null;
  redeemedBy: string | null;
};

type AuthStateFile = {
  version: 1;
  allowlist: AllowlistEntry[];
};

type InviteStateFile = {
  version: 1;
  invites: InviteEntry[];
};

export type InviteRecord = Omit<InviteEntry, "tokenHash">;

export type CreateInviteResult = {
  inviteId: string;
  inviteToken: string;
  invite: InviteRecord;
};

export type AuthStatus = {
  actorPubkey: string;
  allowlisted: boolean;
  allowlistEntry: AllowlistEntry | null;
  inviteSupported: true;
};

export class AuthStateStore {
  private readonly rootDir: string;
  private readonly allowlistPath: string;
  private readonly invitesPath: string;
  private readonly ready: Promise<void>;

  public constructor(rootDir = DEFAULT_AUTH_STATE_DIR) {
    this.rootDir = rootDir;
    this.allowlistPath = path.join(rootDir, "allowlist.json");
    this.invitesPath = path.join(rootDir, "invites.json");
    this.ready = this.initialize();
  }

  public async initializeWithSeedPubkeys(pubkeys: string[]): Promise<void> {
    await this.ready;
    const state = await this.readAllowlistState();
    let changed = false;

    for (const pubkey of pubkeys) {
      const normalized = normalizePubkey(pubkey);
      if (state.allowlist.some((entry) => entry.pubkey === normalized)) {
        continue;
      }
      state.allowlist.push({
        pubkey: normalized,
        label: null,
        source: "env",
        createdAt: nowIso(),
        invitedByTokenId: null,
      });
      changed = true;
    }

    if (changed) {
      state.allowlist.sort((left, right) => left.pubkey.localeCompare(right.pubkey));
      await this.writeAllowlistState(state);
    }
  }

  public async authStatus(actorPubkey: string): Promise<AuthStatus> {
    await this.ready;
    const normalized = normalizePubkey(actorPubkey);
    const allowlist = await this.listAllowlist();
    const entry = allowlist.find((candidate) => candidate.pubkey === normalized) ?? null;

    return {
      actorPubkey: normalized,
      allowlisted: entry !== null,
      allowlistEntry: entry,
      inviteSupported: true,
    };
  }

  public async isAllowlisted(actorPubkey: string): Promise<boolean> {
    const status = await this.authStatus(actorPubkey);
    return status.allowlisted;
  }

  public async listAllowlist(): Promise<AllowlistEntry[]> {
    await this.ready;
    const state = await this.readAllowlistState();
    return state.allowlist.map(cloneAllowlistEntry);
  }

  public async addAllowlistEntry(input: {
    pubkey: string;
    label?: string | null;
    source?: AllowlistEntry["source"];
    invitedByTokenId?: string | null;
  }): Promise<AllowlistEntry> {
    await this.ready;
    const normalized = normalizePubkey(input.pubkey);
    const state = await this.readAllowlistState();
    const existing = state.allowlist.find((entry) => entry.pubkey === normalized);
    if (existing) {
      return cloneAllowlistEntry(existing);
    }

    const created: AllowlistEntry = {
      pubkey: normalized,
      label: normalizeOptionalString(input.label),
      source: input.source ?? "admin",
      createdAt: nowIso(),
      invitedByTokenId: normalizeOptionalString(input.invitedByTokenId),
    };
    state.allowlist.push(created);
    state.allowlist.sort((left, right) => left.pubkey.localeCompare(right.pubkey));
    await this.writeAllowlistState(state);
    return cloneAllowlistEntry(created);
  }

  public async removeAllowlistEntry(pubkey: string): Promise<boolean> {
    await this.ready;
    const normalized = normalizePubkey(pubkey);
    const state = await this.readAllowlistState();
    const next = state.allowlist.filter((entry) => entry.pubkey !== normalized);
    if (next.length === state.allowlist.length) {
      return false;
    }

    state.allowlist = next;
    await this.writeAllowlistState(state);
    return true;
  }

  public async createInvite(input?: {
    label?: string | null;
    ttlSeconds?: number | null;
  }): Promise<CreateInviteResult> {
    await this.ready;
    const invites = await this.readInviteState();
    const inviteToken = `cshinv_${randomBytes(24).toString("base64url")}`;
    const invite: InviteEntry = {
      id: randomUUID(),
      tokenHash: hashInviteToken(inviteToken),
      label: normalizeOptionalString(input?.label),
      createdAt: nowIso(),
      expiresAt:
        input?.ttlSeconds && input.ttlSeconds > 0
          ? new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
          : null,
      revokedAt: null,
      redeemedAt: null,
      redeemedBy: null,
    };

    invites.invites.push(invite);
    invites.invites.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    await this.writeInviteState(invites);

    return {
      inviteId: invite.id,
      inviteToken,
      invite: stripInviteSecret(invite),
    };
  }

  public async listInvites(): Promise<InviteRecord[]> {
    await this.ready;
    const state = await this.readInviteState();
    return state.invites.map(stripInviteSecret);
  }

  public async revokeInvite(inviteId: string): Promise<boolean> {
    await this.ready;
    const state = await this.readInviteState();
    const invite = state.invites.find((entry) => entry.id === inviteId);
    if (!invite) {
      return false;
    }
    if (!invite.revokedAt) {
      invite.revokedAt = nowIso();
      await this.writeInviteState(state);
    }
    return true;
  }

  public async redeemInvite(actorPubkey: string, inviteToken: string): Promise<AllowlistEntry> {
    await this.ready;
    const normalizedPubkey = normalizePubkey(actorPubkey);
    const allowlisted = await this.authStatus(normalizedPubkey);
    if (allowlisted.allowlisted && allowlisted.allowlistEntry) {
      return allowlisted.allowlistEntry;
    }

    const tokenHash = hashInviteToken(inviteToken);
    const invites = await this.readInviteState();
    const invite = invites.invites.find((entry) => entry.tokenHash === tokenHash);
    if (!invite) {
      throw new Error("Invalid invite token");
    }
    if (invite.revokedAt) {
      throw new Error("Invite token has been revoked");
    }
    if (invite.redeemedAt) {
      throw new Error("Invite token has already been redeemed");
    }
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new Error("Invite token has expired");
    }

    invite.redeemedAt = nowIso();
    invite.redeemedBy = normalizedPubkey;

    const allowlistState = await this.readAllowlistState();
    const created: AllowlistEntry = {
      pubkey: normalizedPubkey,
      label: invite.label,
      source: "invite",
      createdAt: invite.redeemedAt,
      invitedByTokenId: invite.id,
    };
    allowlistState.allowlist.push(created);
    allowlistState.allowlist.sort((left, right) => left.pubkey.localeCompare(right.pubkey));

    await this.writeAllowlistState(allowlistState);
    await this.writeInviteState(invites);
    return cloneAllowlistEntry(created);
  }

  private async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    await chmod(this.rootDir, 0o700);
    await ensureJsonFile<AuthStateFile>(this.allowlistPath, { version: 1, allowlist: [] });
    await ensureJsonFile<InviteStateFile>(this.invitesPath, { version: 1, invites: [] });
  }

  private async readAllowlistState(): Promise<AuthStateFile> {
    return parseAllowlistState(await readFile(this.allowlistPath, "utf8"));
  }

  private async writeAllowlistState(state: AuthStateFile): Promise<void> {
    await writePrivateJson(this.allowlistPath, stableStringifyAllowlist(state));
  }

  private async readInviteState(): Promise<InviteStateFile> {
    return parseInviteState(await readFile(this.invitesPath, "utf8"));
  }

  private async writeInviteState(state: InviteStateFile): Promise<void> {
    await writePrivateJson(this.invitesPath, stableStringifyInvites(state));
  }
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizePubkey(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`Invalid pubkey: ${value}`);
  }
  return normalized;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneAllowlistEntry(entry: AllowlistEntry): AllowlistEntry {
  return {
    ...entry,
  };
}

function stripInviteSecret(invite: InviteEntry): InviteRecord {
  const { tokenHash: _tokenHash, ...rest } = invite;
  return {
    ...rest,
  };
}

function parseAllowlistState(text: string): AuthStateFile {
  const value = JSON.parse(text) as Partial<AuthStateFile>;
  if (value.version !== 1 || !Array.isArray(value.allowlist)) {
    throw new Error("Invalid allowlist state");
  }
  return {
    version: 1,
    allowlist: value.allowlist.map((entry) => ({
      pubkey: normalizePubkey(String(entry.pubkey)),
      label: normalizeOptionalString(entry.label as string | null | undefined),
      source: parseAllowlistSource(String(entry.source)),
      createdAt: String(entry.createdAt),
      invitedByTokenId: normalizeOptionalString(entry.invitedByTokenId as string | null | undefined),
    })),
  };
}

function parseInviteState(text: string): InviteStateFile {
  const value = JSON.parse(text) as Partial<InviteStateFile>;
  if (value.version !== 1 || !Array.isArray(value.invites)) {
    throw new Error("Invalid invite state");
  }
  return {
    version: 1,
    invites: value.invites.map((entry) => ({
      id: String(entry.id),
      tokenHash: String(entry.tokenHash),
      label: normalizeOptionalString(entry.label as string | null | undefined),
      createdAt: String(entry.createdAt),
      expiresAt: normalizeOptionalString(entry.expiresAt as string | null | undefined),
      revokedAt: normalizeOptionalString(entry.revokedAt as string | null | undefined),
      redeemedAt: normalizeOptionalString(entry.redeemedAt as string | null | undefined),
      redeemedBy: normalizeOptionalString(entry.redeemedBy as string | null | undefined),
    })),
  };
}

function parseAllowlistSource(value: string): AllowlistEntry["source"] {
  if (value === "env" || value === "admin" || value === "invite") {
    return value;
  }
  throw new Error(`Invalid allowlist source: ${value}`);
}

async function ensureJsonFile<T>(filePath: string, fallback: T): Promise<void> {
  try {
    await stat(filePath);
    await chmod(filePath, 0o600);
  } catch {
    await writePrivateJson(filePath, `${JSON.stringify(fallback, null, 2)}\n`);
  }
}

async function writePrivateJson(filePath: string, text: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, text, { mode: 0o600 });
  await chmod(tempPath, 0o600);
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600);
}

function stableStringifyAllowlist(state: AuthStateFile): string {
  return `${JSON.stringify(
    {
      version: 1,
      allowlist: [...state.allowlist]
        .sort((left, right) => left.pubkey.localeCompare(right.pubkey))
        .map((entry) => ({
          pubkey: entry.pubkey,
          label: entry.label,
          source: entry.source,
          createdAt: entry.createdAt,
          invitedByTokenId: entry.invitedByTokenId,
        })),
    },
    null,
    2,
  )}\n`;
}

function stableStringifyInvites(state: InviteStateFile): string {
  return `${JSON.stringify(
    {
      version: 1,
      invites: [...state.invites]
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((entry) => ({
          id: entry.id,
          tokenHash: entry.tokenHash,
          label: entry.label,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
          revokedAt: entry.revokedAt,
          redeemedAt: entry.redeemedAt,
          redeemedBy: entry.redeemedBy,
        })),
    },
    null,
    2,
  )}\n`;
}
