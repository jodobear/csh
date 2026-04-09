#!/usr/bin/env bun
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import { defaultEnvFile, loadConfig, repoRoot, validateConfig } from "./config";
import { startLoggedProcess, terminateProcess, waitForLogMarker, waitForTcpListener } from "./host-control";

export const PUBLIC_RELAY_URL = "wss://relay.contextvm.org";

type ReleaseLogPaths = {
  root: string;
  freshCheckoutLog: string;
  publicEnvFile: string;
  publicHostLog: string;
  publicShellLog: string;
  publicBrowserLog: string;
  publicBrowserSmokeLog: string;
};

export function buildPublicRelayEnv(
  baseEnvText: string,
  overrides: {
    relayUrl: string;
    browserHost: string;
    browserPort: number;
  },
): string {
  const lines = baseEnvText
    .split(/\r?\n/)
    .filter((line) =>
      !line.startsWith("CVM_RELAYS=") &&
      !line.startsWith("CSH_BROWSER_HOST=") &&
      !line.startsWith("CSH_BROWSER_PORT="),
    )
    .filter((line, index, all) => !(line === "" && index === all.length - 1));

  lines.push(`CVM_RELAYS="${overrides.relayUrl}"`);
  lines.push(`CSH_BROWSER_HOST="${overrides.browserHost}"`);
  lines.push(`CSH_BROWSER_PORT="${String(overrides.browserPort)}"`);
  return `${lines.join("\n")}\n`;
}

function releaseLogPaths(rootDir = repoRoot()): ReleaseLogPaths {
  const root = path.join(rootDir, ".csh-runtime", "logs", "release-verify");
  return {
    root,
    freshCheckoutLog: path.join(root, "fresh-checkout.log"),
    publicEnvFile: path.join(rootDir, ".csh-runtime", "release-public.env"),
    publicHostLog: path.join(root, "public-host.log"),
    publicShellLog: path.join(root, "public-shell.log"),
    publicBrowserLog: path.join(root, "public-browser.log"),
    publicBrowserSmokeLog: path.join(root, "public-browser-smoke.log"),
  };
}

async function pickFreeLoopbackPort(start = 43280, count = 200): Promise<number> {
  for (let port = start; port < start + count; port += 1) {
    const result = await runCommand("bash", ["-lc", `! ss -ltn 2>/dev/null | grep -q ':${port} '`], {
      stdio: "ignore",
    });
    if (result === 0) {
      return port;
    }
  }

  throw new Error(`Could not find a free loopback port in range ${start}-${start + count - 1}`);
}

async function ensureBootstrapEnv(envFile: string): Promise<void> {
  try {
    statSync(envFile);
  } catch {
    const code = await runCommand("bash", ["scripts/bootstrap-env.sh", envFile], {
      cwd: repoRoot(),
      stdio: "inherit",
    });
    if (code !== 0) {
      throw new Error(`bootstrap-env.sh failed for ${envFile} with exit code ${code}`);
    }
  }
}

async function runFreshCheckout(logPath: string): Promise<void> {
  const code = await runCommand("bun", ["run", "scripts/fresh-checkout.ts"], {
    cwd: repoRoot(),
    stdio: "pipe-to-log",
    logPath,
    env: {
      BUN_TMPDIR: "/tmp",
      BUN_INSTALL: "/tmp/bun-install",
    },
  });

  if (code !== 0) {
    throw new Error(`fresh checkout verify failed with exit code ${code}`);
  }
}

async function runPublicRelayCompatibility(
  envFile: string,
  logs: ReleaseLogPaths,
): Promise<{ shellStatus: number; browserStatus: number; browserPort: number }> {
  const browserPort = await pickFreeLoopbackPort();
  const publicEnvText = buildPublicRelayEnv(readFileSync(envFile, "utf8"), {
    relayUrl: PUBLIC_RELAY_URL,
    browserHost: "127.0.0.1",
    browserPort,
  });

  mkdirSync(path.dirname(logs.publicEnvFile), { recursive: true, mode: 0o700 });
  writeFileSync(logs.publicEnvFile, publicEnvText, { encoding: "utf8", mode: 0o600 });

  let hostPid: number | null = null;
  let browserPid: number | null = null;

  try {
    const host = await startLoggedProcess("bash", ["scripts/start-host.sh", logs.publicEnvFile], logs.publicHostLog, {
      cwd: repoRoot(),
    });
    hostPid = host.pid;
    await waitForLogMarker(logs.publicHostLog, "csh ContextVM gateway started", host.pid, 30_000);

    const shellStatus = await runCommand(
      "bun",
      ["run", "scripts/csh.ts", "exec", "pwd", logs.publicEnvFile],
      {
        cwd: repoRoot(),
        stdio: "pipe-to-log",
        logPath: logs.publicShellLog,
        env: {
          BUN_TMPDIR: "/tmp",
          BUN_INSTALL: "/tmp/bun-install",
        },
      },
    );
    const shellOutput = safeRead(logs.publicShellLog);
    if (shellStatus !== 0 || !shellOutput.includes(repoRoot())) {
      throw new Error(`public relay shell proof failed with exit code ${shellStatus}`);
    }

    const browser = await startLoggedProcess(
      "bun",
      ["run", "scripts/csh.ts", "browser", logs.publicEnvFile],
      logs.publicBrowserLog,
      {
        cwd: repoRoot(),
        env: {
          BUN_TMPDIR: "/tmp",
          BUN_INSTALL: "/tmp/bun-install",
        },
      },
    );
    browserPid = browser.pid;
    await waitForLogMarker(logs.publicBrowserLog, "csh browser UI (contextvm) listening on", browser.pid, 30_000);
    await waitForTcpListener("127.0.0.1", browserPort, browser.pid, 30_000);

    const browserStatus = await runCommand("bun", ["run", "csh:browser-smoke"], {
      cwd: repoRoot(),
      stdio: "pipe-to-log",
      logPath: logs.publicBrowserSmokeLog,
      env: {
        BUN_TMPDIR: "/tmp",
        BUN_INSTALL: "/tmp/bun-install",
        CVM_ENV_FILE: logs.publicEnvFile,
      },
    });
    const browserOutput = safeRead(logs.publicBrowserSmokeLog);
    if (browserStatus !== 0 || !browserOutput.includes("__BROWSER__/")) {
      throw new Error(`public relay browser proof failed with exit code ${browserStatus}`);
    }

    return { shellStatus, browserStatus, browserPort };
  } finally {
    if (browserPid !== null) {
      await terminateProcess(browserPid).catch(() => undefined);
    }
    if (hostPid !== null) {
      await terminateProcess(hostPid).catch(() => undefined);
    }
  }
}

if (import.meta.main) {
  const envFile = path.resolve(process.argv[2] ?? defaultEnvFile());
  await ensureBootstrapEnv(envFile);

  const config = loadConfig(envFile);
  const check = validateConfig(config, "full");
  if (!check.ok) {
    throw new Error(check.errors.join("\n"));
  }

  const logs = releaseLogPaths();
  mkdirSync(logs.root, { recursive: true, mode: 0o700 });

  await runFreshCheckout(logs.freshCheckoutLog);
  const publicProof = await runPublicRelayCompatibility(envFile, logs);

  console.log(`release_verify_fresh_checkout_log=${logs.freshCheckoutLog}`);
  console.log(`release_verify_public_env=${logs.publicEnvFile}`);
  console.log(`release_verify_public_relay=${PUBLIC_RELAY_URL}`);
  console.log(`release_verify_public_shell_log=${logs.publicShellLog}`);
  console.log(`release_verify_public_shell_status=${publicProof.shellStatus}`);
  console.log(`release_verify_public_browser_log=${logs.publicBrowserLog}`);
  console.log(`release_verify_public_browser_port=${publicProof.browserPort}`);
  console.log(`release_verify_public_browser_smoke_log=${logs.publicBrowserSmokeLog}`);
  console.log(`release_verify_public_browser_status=${publicProof.browserStatus}`);
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: Record<string, string>;
    stdio?: "inherit" | "ignore" | "pipe-to-log";
    logPath?: string;
  } = {},
): Promise<number> {
  if (options.stdio === "pipe-to-log" && !options.logPath) {
    throw new Error(`Missing logPath for ${command}`);
  }

  if (options.stdio === "pipe-to-log" && options.logPath) {
    mkdirSync(path.dirname(options.logPath), { recursive: true, mode: 0o700 });
    writeFileSync(options.logPath, "", { encoding: "utf8", mode: 0o600 });
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot(),
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: options.stdio === "inherit" ? "inherit" : "pipe",
    });

    if (options.stdio === "pipe-to-log" && options.logPath) {
      child.stdout?.on("data", (chunk) => appendLog(options.logPath!, chunk));
      child.stderr?.on("data", (chunk) => appendLog(options.logPath!, chunk));
    }

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(code ?? 0);
    });
  });
}

function appendLog(logPath: string, chunk: string | Buffer): void {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  writeFileSync(logPath, text, {
    encoding: "utf8",
    flag: "a",
    mode: 0o600,
  });
}

function safeRead(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}
