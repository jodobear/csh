#!/usr/bin/env bun
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  defaultEnvFile,
  loadConfig,
  parseEnvFile,
  repoRoot,
  runtimePaths,
  validateConfig,
} from "./config";

const envFilePath = path.resolve(process.argv[2] ?? defaultEnvFile());
const config = loadConfig(envFilePath);
const check = validateConfig(config, "host");
if (!check.ok) {
  throw new Error(check.errors.join("\n"));
}

process.umask(0o077);

const paths = runtimePaths();
mkdirSync(paths.logsDir, { recursive: true, mode: 0o700 });
mkdirSync(path.join(paths.runtimeDir, "sessions"), { recursive: true, mode: 0o700 });
chmodSync(paths.runtimeDir, 0o700);
chmodSync(paths.logsDir, 0o700);
chmodSync(path.join(paths.runtimeDir, "sessions"), 0o700);

const parsedEnv = parseEnvFile(envFilePath);
for (const [key, value] of Object.entries(parsedEnv)) {
  process.env[key] = value;
}

process.env.CSH_NOSTR_PRIVATE_KEY = process.env.CSH_NOSTR_PRIVATE_KEY || config.gatewayPrivateKey;
process.env.CSH_NOSTR_RELAY_URLS = process.env.CSH_NOSTR_RELAY_URLS || config.relays.join(",");
process.env.CSH_ALLOWED_PUBLIC_KEYS =
  process.env.CSH_ALLOWED_PUBLIC_KEYS || config.gatewayAllowedPublicKeys.join(",");
process.env.CSH_ALLOW_UNLISTED_CLIENTS =
  process.env.CSH_ALLOW_UNLISTED_CLIENTS ||
  (config.gatewayAllowUnlistedClients ? "1" : "0");
process.env.CSH_SERVER_NAME =
  process.env.CSH_SERVER_NAME || config.gatewayServerInfoName || "csh interactive host";
process.env.CSH_SERVER_WEBSITE =
  process.env.CSH_SERVER_WEBSITE || config.gatewayServerInfoWebsite;
process.env.CSH_SERVER_ABOUT =
  process.env.CSH_SERVER_ABOUT || "Private interactive ContextVM shell host.";
process.env.CSH_ENCRYPTION_MODE =
  process.env.CSH_ENCRYPTION_MODE || config.gatewayEncryptionMode || "required";
process.env.CSH_SESSION_STATE_DIR =
  process.env.CSH_SESSION_STATE_DIR || path.join(paths.runtimeDir, "sessions");
process.env.CVM_ENV_FILE = envFilePath;

console.error("Starting repo-local csh ContextVM gateway");
await import(pathToFileURL(path.join(repoRoot(), "src", "contextvm-gateway.ts")).href);
