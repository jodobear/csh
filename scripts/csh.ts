#!/usr/bin/env bun
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

import {
  closeSession,
  createDirectClient,
  loadEnvFile,
  openSession,
  pollSession,
  sleep,
  writeSession,
} from "./client-common";
import {
  currentUsername,
  defaultEnvFile,
  loadConfig,
  redactConfig,
  renderSystemdUnit,
  repoRoot,
  runtimePaths,
  validateConfig,
  writeBootstrapEnv,
} from "./config";

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      positionals.push(part);
      continue;
    }

    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }

  return { positionals, flags };
}

async function runCommand(command: string, args: string[], extraEnv?: Record<string, string>): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot(),
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv,
      },
    });

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

function usage(): string {
  return `Usage: csh <command> [options]

Commands:
  bootstrap [config-path]          Generate a private-by-default config file
  runtime install                  Install or refresh runtime dependencies
  host start [config-path]         Start the persistent host gateway
  host check [config-path]         Validate config and runtime readiness
  host print-config [config-path]  Print redacted config
  host systemd-unit [config-path]  Print or write a hardened systemd unit
  direct [config-path]             Run the direct smoke test
  lifecycle [config-path]          Run reconnect/session cleanup verification
  proxy [config-path]              Run the stdio proxy smoke test
  exec <command> [config-path]     Execute one shell command in a fresh remote shell session
  shell [config-path]              Start the interactive operator shell
  browser [config-path]            Start the browser terminal UI over ContextVM
  browser-local                    Start the browser terminal UI against a local stdio server
  verify [config-path]             Run the full verification loop
  help                             Show this help

Flags:
  --config <path>                  Explicit config path
  --session <id>                   Session id for shell reconnect
  --output <path>                  Output path for systemd-unit
  --user <user>                    User for rendered systemd unit
  --group <group>                  Group for rendered systemd unit
  --close-on-exit                  Close the remote shell session when leaving csh shell
`;
}

function configPathFrom(parsed: ParsedArgs, fallbackPosition?: string): string {
  const explicit = parsed.flags.config;
  if (typeof explicit === "string") {
    return path.resolve(explicit);
  }
  if (fallbackPosition) {
    return path.resolve(fallbackPosition);
  }
  return defaultEnvFile();
}

function requireHealthyConfig(configPath: string, mode: "host" | "client" | "full"): ReturnType<typeof loadConfig> {
  const config = loadConfig(configPath);
  const check = validateConfig(config, mode);
  if (!check.ok) {
    throw new Error(check.errors.join("\n"));
  }
  return config;
}

async function commandBootstrap(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  mkdirSync(path.dirname(configPath), { recursive: true });
  const result = writeBootstrapEnv(configPath);
  console.log(`Wrote ${result.outputFile}`);
  console.log(`Allowed client pubkey: ${result.allowedClientPubkey}`);
}

async function commandRuntimeInstall(): Promise<void> {
  const code = await runCommand("bash", ["scripts/install-runtime.sh"]);
  if (code !== 0) {
    process.exit(code);
  }
}

async function commandHostStart(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[2]);
  requireHealthyConfig(configPath, "host");
  if (
    typeof process.getuid === "function" &&
    process.getuid() === 0 &&
    process.env.CSH_ALLOW_ROOT !== "1"
  ) {
    throw new Error("Refusing to start the host as root. Use a dedicated service account or set CSH_ALLOW_ROOT=1 to override.");
  }
  const code = await runCommand("bash", ["scripts/start-host.sh", configPath]);
  process.exit(code);
}

async function commandHostCheck(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[2]);
  const config = loadConfig(configPath);
  const check = validateConfig(config, "host");
  const paths = runtimePaths();
  const runtimeWarnings: string[] = [];
  const runtimeErrors: string[] = [];

  for (const [label, candidate] of Object.entries({
    srcMain: paths.srcMain,
    srcGateway: paths.srcGateway,
  })) {
    try {
      const mode = Bun.file(candidate);
      if (!(await mode.exists())) {
        runtimeErrors.push(`Missing ${label}: ${candidate}`);
      }
    } catch {
      runtimeErrors.push(`Missing ${label}: ${candidate}`);
    }
  }

  if (typeof process.getuid === "function" && process.getuid() === 0) {
    runtimeWarnings.push("Running as root is discouraged; prefer a dedicated non-root service account.");
  }
  if (!Bun.which("tmux")) {
    runtimeErrors.push("Missing tmux in PATH.");
  }
  if (!Bun.which("bun")) {
    runtimeErrors.push("Missing bun in PATH.");
  }

  const allWarnings = [...check.warnings, ...runtimeWarnings];
  const allErrors = [...check.errors, ...runtimeErrors];

  console.log(JSON.stringify({
    ok: allErrors.length === 0,
    configPath,
    warnings: allWarnings,
    errors: allErrors,
    runtime: paths,
  }, null, 2));

  if (allErrors.length > 0) {
    process.exit(1);
  }
}

async function commandHostPrintConfig(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[2]);
  const config = loadConfig(configPath);
  console.log(JSON.stringify(redactConfig(config), null, 2));
}

async function commandHostSystemdUnit(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[2]);
  requireHealthyConfig(configPath, "host");
  const unitText = renderSystemdUnit(configPath, {
    user: typeof parsed.flags.user === "string" ? parsed.flags.user : currentUsername(),
    group: typeof parsed.flags.group === "string" ? parsed.flags.group : undefined,
  });
  const outputPath = typeof parsed.flags.output === "string" ? path.resolve(parsed.flags.output) : null;
  if (outputPath) {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, unitText, "utf8");
    chmodSync(outputPath, 0o644);
    console.log(`Wrote ${outputPath}`);
    return;
  }
  process.stdout.write(unitText);
}

async function commandDirect(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "client");
  const code = await runCommand("bun", ["run", "csh:smoke"], { CVM_ENV_FILE: configPath });
  process.exit(code);
}

async function commandLifecycle(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "client");
  const code = await runCommand("bun", ["run", "csh:lifecycle"], { CVM_ENV_FILE: configPath });
  process.exit(code);
}

async function commandProxy(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "client");
  const code = await runCommand("bun", ["run", "csh:proxy-smoke"], { CVM_ENV_FILE: configPath });
  process.exit(code);
}

async function commandExec(parsed: ParsedArgs): Promise<void> {
  const remoteCommand = parsed.positionals[1];
  if (!remoteCommand) {
    throw new Error("exec requires a shell command argument.");
  }
  const configPath = configPathFrom(parsed, parsed.positionals[2]);
  requireHealthyConfig(configPath, "client");
  process.env.CVM_ENV_FILE = configPath;
  loadEnvFile(configPath);
  const client = await createDirectClient("csh-exec");
  const session = await openSession(client, {
    cols: 120,
    rows: 40,
  });
  let shouldCloseSession = true;

  try {
    await writeSession(client, session.sessionId, `${remoteCommand}\nexit\n`);

    const timeoutMs = 15_000;
    const startedAt = Date.now();
    let cursor = session.cursor;
    let lastSnapshot: string | null = null;
    let remoteClosed = false;

    while (Date.now() - startedAt < timeoutMs) {
      const result = await pollSession(client, session.sessionId, cursor);
      cursor = result.cursor;

      if (result.snapshot !== null) {
        lastSnapshot = result.snapshot;
      }

      if (result.closedAt) {
        remoteClosed = true;
        break;
      }

      await sleep(60);
    }

    if (!remoteClosed) {
      shouldCloseSession = false;
      const reconnectHint = `bin/csh shell --session ${session.sessionId} --config ${configPath}`;
      if (lastSnapshot) {
        process.stderr.write(stripDeadPaneFooter(lastSnapshot).trimEnd());
        process.stderr.write("\n");
      }
      throw new Error(
        `Remote command did not finish within ${timeoutMs}ms. Session left open for inspection: ${reconnectHint}`,
      );
    }

    if (lastSnapshot) {
      process.stdout.write(stripDeadPaneFooter(lastSnapshot).trimEnd());
      process.stdout.write("\n");
    }
  } finally {
    if (shouldCloseSession) {
      await closeSession(client, session.sessionId).catch(() => undefined);
    }
    await client.close();
  }
}

function stripDeadPaneFooter(snapshot: string): string {
  return snapshot.replace(/\n*Pane is dead \(status[^\n]*\):?\s*$/s, "");
}

async function commandShell(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "client");
  process.env.CVM_ENV_FILE = configPath;
  loadEnvFile(configPath);
  const extraEnv: Record<string, string> = {};
  if (typeof parsed.flags.session === "string") {
    extraEnv.CSH_SESSION_ID = parsed.flags.session;
  }
  if (parsed.flags["close-on-exit"] === true) {
    extraEnv.CSH_CLOSE_ON_EXIT = "1";
  }

  const code = await runCommand("bun", ["run", "src/contextvm-interactive-client.ts"], extraEnv);
  process.exit(code);
}

async function commandBrowser(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "client");
  process.env.CVM_ENV_FILE = configPath;
  loadEnvFile(configPath);
  const code = await runCommand("bun", ["run", "src/browser/contextvm-server.ts"]);
  process.exit(code);
}

async function commandBrowserLocal(): Promise<void> {
  const code = await runCommand("bun", ["run", "src/browser/server.ts"]);
  process.exit(code);
}

async function commandVerify(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "full");
  const code = await runCommand("bash", ["scripts/run-autonomous-loop.sh", configPath]);
  process.exit(code);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const [command, subcommand] = parsed.positionals;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "bootstrap") {
    await commandBootstrap(parsed);
    return;
  }
  if (command === "runtime" && subcommand === "install") {
    await commandRuntimeInstall();
    return;
  }
  if (command === "host" && subcommand === "start") {
    await commandHostStart(parsed);
    return;
  }
  if (command === "host" && subcommand === "check") {
    await commandHostCheck(parsed);
    return;
  }
  if (command === "host" && subcommand === "print-config") {
    await commandHostPrintConfig(parsed);
    return;
  }
  if (command === "host" && subcommand === "systemd-unit") {
    await commandHostSystemdUnit(parsed);
    return;
  }
  if (command === "direct") {
    await commandDirect(parsed);
    return;
  }
  if (command === "lifecycle") {
    await commandLifecycle(parsed);
    return;
  }
  if (command === "proxy") {
    await commandProxy(parsed);
    return;
  }
  if (command === "exec") {
    await commandExec(parsed);
    return;
  }
  if (command === "shell") {
    await commandShell(parsed);
    return;
  }
  if (command === "browser") {
    await commandBrowser(parsed);
    return;
  }
  if (command === "browser-local") {
    await commandBrowserLocal();
    return;
  }
  if (command === "verify") {
    await commandVerify(parsed);
    return;
  }

  throw new Error(`Unknown command: ${command}${subcommand ? ` ${subcommand}` : ""}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
