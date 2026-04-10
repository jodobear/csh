import path from "node:path";
import { AuthStateStore, type AllowlistEntry, type CreateInviteResult, type InviteRecord } from "../src/auth/state.js";
import { loadAllowlistSeedPubkeys } from "../src/auth/server.js";
import { defaultEnvFile, parseEnvFile, repoRoot } from "./config";

export type AuthCliEnv = Record<string, string | undefined>;

type AuthCliContext = {
  configPath: string;
  env: AuthCliEnv;
  store: AuthStateStore;
};

export async function listAllowlistEntries(configPath = defaultEnvFile()): Promise<AllowlistEntry[]> {
  const context = await createAuthCliContext(configPath);
  return await context.store.listAllowlist();
}

export async function addAllowlistEntry(
  pubkey: string,
  options: { configPath?: string; label?: string | null } = {},
): Promise<AllowlistEntry> {
  const context = await createAuthCliContext(options.configPath);
  return await context.store.addAllowlistEntry({
    pubkey,
    label: options.label ?? null,
    source: "admin",
  });
}

export async function removeAllowlistEntry(
  pubkey: string,
  configPath = defaultEnvFile(),
): Promise<boolean> {
  const context = await createAuthCliContext(configPath);
  return await context.store.removeAllowlistEntry(pubkey);
}

export async function createInvite(
  options: { configPath?: string; label?: string | null; ttlSeconds?: number | null } = {},
): Promise<CreateInviteResult> {
  const context = await createAuthCliContext(options.configPath);
  return await context.store.createInvite({
    label: options.label ?? null,
    ttlSeconds: options.ttlSeconds ?? null,
  });
}

export async function listInvites(configPath = defaultEnvFile()): Promise<InviteRecord[]> {
  const context = await createAuthCliContext(configPath);
  return await context.store.listInvites();
}

export async function revokeInvite(
  inviteId: string,
  configPath = defaultEnvFile(),
): Promise<boolean> {
  const context = await createAuthCliContext(configPath);
  return await context.store.revokeInvite(inviteId);
}

async function createAuthCliContext(configPath = defaultEnvFile()): Promise<AuthCliContext> {
  const resolvedConfigPath = path.resolve(configPath);
  const env = loadConfigEnv(resolvedConfigPath);
  const stateDir = resolveStateDir(resolvedConfigPath, env.CSH_AUTH_STATE_DIR);
  const store = new AuthStateStore(stateDir);
  await store.initializeWithSeedPubkeys(loadAllowlistSeedPubkeys(env));
  return {
    configPath: resolvedConfigPath,
    env,
    store,
  };
}

function loadConfigEnv(configPath: string): AuthCliEnv {
  const parsed = safeParseEnvFile(configPath);
  return {
    ...process.env,
    ...parsed,
  };
}

function safeParseEnvFile(configPath: string): Record<string, string> {
  try {
    return parseEnvFile(configPath);
  } catch {
    return {};
  }
}

function resolveStateDir(configPath: string, configuredDir: string | undefined): string {
  if (!configuredDir || configuredDir.trim().length === 0) {
    return path.join(repoRoot(), ".csh-runtime", "auth");
  }
  if (path.isAbsolute(configuredDir)) {
    return configuredDir;
  }
  return path.resolve(path.dirname(configPath), configuredDir);
}
