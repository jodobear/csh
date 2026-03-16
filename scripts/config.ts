import { randomUUID } from "node:crypto";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { generateSecretKey, getPublicKey } from "nostr-tools";

export type ClientLogLevel = "debug" | "info" | "warn" | "error" | "silent";
export type EncryptionMode = "optional" | "required" | "disabled";

export type AppConfig = {
  envFilePath: string;
  relays: string[];
  gatewayPrivateKey: string;
  gatewayServerInfoName: string;
  gatewayServerInfoWebsite: string;
  gatewayServerInfoPicture: string;
  gatewayAllowUnlistedClients: boolean;
  gatewayAllowedPublicKeys: string[];
  gatewayEncryptionMode: EncryptionMode;
  clientPrivateKey: string;
  serverPubkey: string;
  proxyEncryptionMode: EncryptionMode;
  logLevel: ClientLogLevel;
  smokeSessionId: string;
  lifecycleSessionId: string;
  responseLookbackSeconds: number;
  browserHost: string;
  browserPort: number;
  browserAllowRemote: boolean;
  browserAuthUser: string;
  browserAuthPassword: string;
  browserTrustProxyTls: boolean;
  sessionIdleTtlSeconds: number;
  closedSessionTtlSeconds: number;
};

export type ConfigCheckResult = {
  ok: boolean;
  warnings: string[];
  errors: string[];
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value.replace(/\\ /g, " ");
}

export function repoRoot(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}

export function defaultEnvFile(): string {
  if (process.env.CSH_CONFIG) {
    return path.resolve(process.env.CSH_CONFIG);
  }
  return path.join(repoRoot(), ".env.csh.local");
}

export function defaultInstallPrefix(env: NodeJS.ProcessEnv = process.env): string {
  return env.CSH_INSTALL_PREFIX || path.join(os.homedir(), ".local");
}

export function installPaths(prefix = defaultInstallPrefix()): {
  prefix: string;
  binDir: string;
  launcherPath: string;
  completionsDir: string;
} {
  return {
    prefix,
    binDir: path.join(prefix, "bin"),
    launcherPath: path.join(prefix, "bin", "csh"),
    completionsDir: path.join(prefix, "share", "csh", "completions"),
  };
}

export function parseEnvFile(envFilePath: string): Record<string, string> {
  const text = readFileSync(envFilePath, "utf8");
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator);
    values[key] = stripQuotes(line.slice(separator + 1));
  }
  return values;
}

function required(values: Record<string, string>, key: string): string {
  const value = values[key];
  if (!value) {
    throw new Error(`Missing required config key: ${key}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function parseList(value: string | undefined): string[] {
  return value
    ? value.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
}

function parseNumber(value: string | undefined, fallback: number, key: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} must be an integer.`);
  }
  return parsed;
}

export function loadConfig(envFilePath: string = defaultEnvFile()): AppConfig {
  const values = parseEnvFile(envFilePath);
  return {
    envFilePath,
    relays: parseList(required(values, "CVM_RELAYS")),
    gatewayPrivateKey: values.GW_PRIVATE_KEY || "",
    gatewayServerInfoName: values.GW_SERVER_INFO_NAME || "csh host",
    gatewayServerInfoWebsite: values.GW_SERVER_INFO_WEBSITE || "",
    gatewayServerInfoPicture: values.GW_SERVER_INFO_PICTURE || "",
    gatewayAllowUnlistedClients: parseBoolean(values.GW_ALLOW_UNLISTED_CLIENTS, false),
    gatewayAllowedPublicKeys: parseList(values.GW_ALLOWED_PUBLIC_KEYS),
    gatewayEncryptionMode: (values.GW_ENCRYPTION_MODE as EncryptionMode) || "required",
    clientPrivateKey: values.CVM_CLIENT_PRIVATE_KEY || "",
    serverPubkey: values.CVM_SERVER_PUBKEY || "",
    proxyEncryptionMode: (values.CVM_PROXY_ENCRYPTION_MODE as EncryptionMode) || "required",
    logLevel: (values.CVM_LOG_LEVEL as ClientLogLevel) || "error",
    smokeSessionId: values.CVM_SMOKE_SESSION_ID || "csh-smoke",
    lifecycleSessionId: values.CVM_LIFECYCLE_SESSION_ID || "csh-lifecycle",
    responseLookbackSeconds: parseNumber(values.CVM_RESPONSE_LOOKBACK_SECONDS, 300, "CVM_RESPONSE_LOOKBACK_SECONDS"),
    browserHost: values.CSH_BROWSER_HOST || "127.0.0.1",
    browserPort: parseNumber(values.CSH_BROWSER_PORT, 4318, "CSH_BROWSER_PORT"),
    browserAllowRemote: parseBoolean(values.CSH_BROWSER_ALLOW_REMOTE, false),
    browserAuthUser: values.CSH_BROWSER_AUTH_USER || "",
    browserAuthPassword: values.CSH_BROWSER_AUTH_PASSWORD || "",
    browserTrustProxyTls: parseBoolean(values.CSH_BROWSER_TRUST_PROXY_TLS, false),
    sessionIdleTtlSeconds: parseNumber(values.CSH_SESSION_IDLE_TTL_SECONDS, 1800, "CSH_SESSION_IDLE_TTL_SECONDS"),
    closedSessionTtlSeconds: parseNumber(values.CSH_CLOSED_SESSION_TTL_SECONDS, 300, "CSH_CLOSED_SESSION_TTL_SECONDS"),
  };
}

function isHexKey(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

export function validateConfig(config: AppConfig, mode: "host" | "client" | "full" = "full"): ConfigCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (config.relays.length === 0) {
    errors.push("At least one relay URL is required.");
  }
  if (!["optional", "required", "disabled"].includes(config.gatewayEncryptionMode)) {
    errors.push(`Invalid GW_ENCRYPTION_MODE: ${config.gatewayEncryptionMode}`);
  }
  if (!["optional", "required", "disabled"].includes(config.proxyEncryptionMode)) {
    errors.push(`Invalid CVM_PROXY_ENCRYPTION_MODE: ${config.proxyEncryptionMode}`);
  }
  if (!["debug", "info", "warn", "error", "silent"].includes(config.logLevel)) {
    errors.push(`Invalid CVM_LOG_LEVEL: ${config.logLevel}`);
  }
  if (!config.browserAllowRemote && !["127.0.0.1", "localhost", "::1"].includes(config.browserHost)) {
    errors.push(`CSH_BROWSER_HOST=${config.browserHost} requires CSH_BROWSER_ALLOW_REMOTE=1.`);
  }
  if (config.browserAllowRemote && (!config.browserAuthUser || !config.browserAuthPassword)) {
    errors.push("CSH_BROWSER_ALLOW_REMOTE=1 requires CSH_BROWSER_AUTH_USER and CSH_BROWSER_AUTH_PASSWORD.");
  }
  if (config.browserAllowRemote && !config.browserTrustProxyTls) {
    errors.push(
      "CSH_BROWSER_ALLOW_REMOTE=1 requires CSH_BROWSER_TRUST_PROXY_TLS=1 and an HTTPS/TLS-terminating reverse proxy.",
    );
  }

  if (mode === "host" || mode === "full") {
    if (!isHexKey(config.gatewayPrivateKey)) {
      errors.push("GW_PRIVATE_KEY must be a 64-character hex key.");
    }
    if (!config.gatewayAllowUnlistedClients && config.gatewayAllowedPublicKeys.length === 0) {
      errors.push("GW_ALLOWED_PUBLIC_KEYS is required unless GW_ALLOW_UNLISTED_CLIENTS=1.");
    }
    for (const pubkey of config.gatewayAllowedPublicKeys) {
      if (!isHexKey(pubkey)) {
        errors.push(`Invalid allowlisted client pubkey: ${pubkey}`);
      }
    }
  }

  if (mode === "client" || mode === "full") {
    if (!isHexKey(config.clientPrivateKey)) {
      errors.push("CVM_CLIENT_PRIVATE_KEY must be a 64-character hex key.");
    }
    if (!isHexKey(config.serverPubkey)) {
      errors.push("CVM_SERVER_PUBKEY must be a 64-character hex key.");
    }
  }

  const fileStat = statSync(config.envFilePath);
  if ((fileStat.mode & 0o077) !== 0) {
    errors.push(`${config.envFilePath} must not be readable by group or others; chmod 600 is required.`);
  }
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    warnings.push("Running as root is discouraged; prefer a dedicated non-root service account.");
  }

  return { ok: errors.length === 0, warnings, errors };
}

export function redactConfig(config: AppConfig): Record<string, unknown> {
  return {
    envFilePath: config.envFilePath,
    relays: config.relays,
    gatewayPrivateKey: config.gatewayPrivateKey ? "<redacted>" : "",
    gatewayServerInfoName: config.gatewayServerInfoName,
    gatewayServerInfoWebsite: config.gatewayServerInfoWebsite,
    gatewayServerInfoPicture: config.gatewayServerInfoPicture,
    gatewayAllowUnlistedClients: config.gatewayAllowUnlistedClients,
    gatewayAllowedPublicKeys: config.gatewayAllowedPublicKeys,
    gatewayEncryptionMode: config.gatewayEncryptionMode,
    clientPrivateKey: config.clientPrivateKey ? "<redacted>" : "",
    serverPubkey: config.serverPubkey,
    proxyEncryptionMode: config.proxyEncryptionMode,
    logLevel: config.logLevel,
    smokeSessionId: config.smokeSessionId,
    lifecycleSessionId: config.lifecycleSessionId,
    responseLookbackSeconds: config.responseLookbackSeconds,
    browserHost: config.browserHost,
    browserPort: config.browserPort,
    browserAllowRemote: config.browserAllowRemote,
    browserAuthUser: config.browserAuthUser,
    browserAuthPassword: config.browserAuthPassword ? "<redacted>" : "",
    browserTrustProxyTls: config.browserTrustProxyTls,
    sessionIdleTtlSeconds: config.sessionIdleTtlSeconds,
    closedSessionTtlSeconds: config.closedSessionTtlSeconds,
  };
}

function formatEnvLine(key: string, value: string): string {
  return `${key}=${JSON.stringify(value)}\n`;
}

export function writeBootstrapEnv(outputFile: string): { outputFile: string; allowedClientPubkey: string } {
  const serverSecret = generateSecretKey();
  const clientSecret = generateSecretKey();
  const serverPrivateKey = Buffer.from(serverSecret).toString("hex");
  const clientPrivateKey = Buffer.from(clientSecret).toString("hex");
  const serverPubkey = getPublicKey(serverSecret);
  const clientPubkey = getPublicKey(clientSecret);
  const browserAuthUser = "csh";
  const browserAuthPassword = randomUUID();

  const text =
    `# Generated by csh bootstrap on ${new Date().toISOString()}\n` +
    formatEnvLine("CVM_RELAYS", "ws://127.0.0.1:10552") +
    formatEnvLine("GW_PRIVATE_KEY", serverPrivateKey) +
    formatEnvLine("GW_SERVER_INFO_NAME", "csh-host") +
    formatEnvLine("GW_SERVER_INFO_WEBSITE", "") +
    formatEnvLine("GW_SERVER_INFO_PICTURE", "") +
    formatEnvLine("GW_ALLOW_UNLISTED_CLIENTS", "0") +
    formatEnvLine("GW_ALLOWED_PUBLIC_KEYS", clientPubkey) +
    formatEnvLine("GW_ENCRYPTION_MODE", "required") +
    formatEnvLine("CVM_CLIENT_PRIVATE_KEY", clientPrivateKey) +
    formatEnvLine("CVM_SERVER_PUBKEY", serverPubkey) +
    formatEnvLine("CVM_PROXY_ENCRYPTION_MODE", "required") +
    formatEnvLine("CVM_LOG_LEVEL", "error") +
    formatEnvLine("CVM_RESPONSE_LOOKBACK_SECONDS", "300") +
    formatEnvLine("CVM_SMOKE_SESSION_ID", "csh-smoke") +
    formatEnvLine("CVM_LIFECYCLE_SESSION_ID", "csh-lifecycle") +
    formatEnvLine("CSH_BROWSER_HOST", "127.0.0.1") +
    formatEnvLine("CSH_BROWSER_PORT", "4318") +
    formatEnvLine("CSH_BROWSER_ALLOW_REMOTE", "0") +
    formatEnvLine("CSH_BROWSER_AUTH_USER", browserAuthUser) +
    formatEnvLine("CSH_BROWSER_AUTH_PASSWORD", browserAuthPassword) +
    formatEnvLine("CSH_BROWSER_TRUST_PROXY_TLS", "0") +
    formatEnvLine("CSH_SESSION_IDLE_TTL_SECONDS", "1800") +
    formatEnvLine("CSH_CLOSED_SESSION_TTL_SECONDS", "300");

  writeFileSync(outputFile, text, "utf8");
  chmodSync(outputFile, 0o600);

  return { outputFile, allowedClientPubkey: clientPubkey };
}

export function runtimePaths(rootDir = repoRoot()): Record<string, string> {
  const runtimeDir = path.join(rootDir, ".csh-runtime");
  return {
    rootDir,
    runtimeDir,
    logsDir: path.join(runtimeDir, "logs"),
    tmuxSocket: path.join(runtimeDir, "tmux.sock"),
    srcMain: path.join(rootDir, "src", "main.ts"),
    srcGateway: path.join(rootDir, "src", "contextvm-gateway.ts"),
  };
}

export function currentUsername(): string {
  return os.userInfo().username;
}

export function renderSystemdUnit(configPath: string, options?: { user?: string; group?: string; description?: string }): string {
  const rootDir = repoRoot();
  const paths = runtimePaths(rootDir);
  const user = options?.user || currentUsername();
  const groupLine = options?.group ? `Group=${options.group}\n` : "";
  const description = options?.description || "csh host gateway";
  const execPath = process.execPath;
  const cliEntry = path.join(rootDir, "scripts", "csh.ts");

  return `[Unit]
Description=${description}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
${groupLine}WorkingDirectory=${systemdQuote(rootDir)}
ExecStart=${systemdQuote(execPath)} ${systemdQuote(cliEntry)} host start ${systemdQuote(configPath)}
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${paths.runtimeDir}
UMask=0077
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;
}

function systemdQuote(value: string): string {
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}
