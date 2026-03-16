#!/usr/bin/env bun
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  defaultInstallPrefix,
  installPaths,
  loadConfig,
  redactConfig,
  renderSystemdUnit,
  repoRoot,
  runtimePaths,
  validateConfig,
  writeBootstrapEnv,
  type AppConfig,
  type ConfigCheckResult,
} from "./config";

type ParsedArgs = {
  positionals: string[];
  flags: Record<string, string | boolean>;
};

type RuntimeCheck = {
  warnings: string[];
  errors: string[];
  commands: Record<string, string | null>;
  files: Record<string, string>;
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
  install                        Install a PATH-friendly launcher into ~/.local/bin by default
  upgrade                        Reinstall or refresh the managed launcher and completions
  uninstall                      Remove the managed launcher and completions
  bootstrap [config-path]        Generate a private-by-default config file
  version                        Print the csh version
  status [config-path]           Show the resolved operator/deployment status
  doctor [config-path]           Run config, runtime, and install diagnostics
  completion <shell>             Print shell completion script for bash, zsh, or fish
  config check [config-path]     Validate the current config file
  runtime install                Install or refresh runtime dependencies
  host start [config-path]       Start the persistent host gateway
  host check [config-path]       Validate host config and runtime readiness
  host print-config [config-path] Print redacted config
  host systemd-unit [config-path] Print or write a hardened systemd unit
  direct [config-path]           Run the direct smoke test
  lifecycle [config-path]        Run reconnect/session cleanup verification
  proxy [config-path]            Run the stdio proxy smoke test
  exec <command> [config-path]   Execute one shell command in a fresh remote shell session
  shell [config-path]            Start the interactive operator shell
  browser [config-path]          Start the browser terminal UI over ContextVM
  browser-local                  Start the browser terminal UI against a local stdio server
  verify [config-path]           Run the full verification loop
  help                           Show this help

Flags:
  --config <path>                Explicit config path
  --mode <auto|host|client|full> Validation mode for doctor/config check
  --session <id>                 Session id for shell reconnect
  --output <path>                Output path for systemd-unit
  --prefix <dir>                 Install prefix for csh install
  --user <user>                  User for rendered systemd unit
  --group <group>                Group for rendered systemd unit
  --json                         Emit JSON for status/check/doctor
  --force                        Overwrite a non-managed launcher during install
  --no-runtime                   Skip bun install/build during install
  --close-on-exit                Close the remote shell session when leaving csh shell
`;
}

function packageVersion(): string {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot(), "package.json"), "utf8")) as {
    version?: string;
  };
  return packageJson.version || "0.0.0";
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

function resolveConfigMode(config: AppConfig, parsed: ParsedArgs): "host" | "client" | "full" {
  const requested = parsed.flags.mode;
  if (requested === "host" || requested === "client" || requested === "full") {
    return requested;
  }

  const hasHost = config.gatewayPrivateKey.length > 0 || config.gatewayAllowedPublicKeys.length > 0;
  const hasClient = config.clientPrivateKey.length > 0 || config.serverPubkey.length > 0;

  if (hasHost && hasClient) {
    return "full";
  }
  if (hasHost) {
    return "host";
  }
  return "client";
}

function requireHealthyConfig(configPath: string, mode: "host" | "client" | "full"): AppConfig {
  const config = loadConfig(configPath);
  const check = validateConfig(config, mode);
  if (!check.ok) {
    throw new Error(check.errors.join("\n"));
  }
  return config;
}

async function gatherRuntimeCheck(): Promise<RuntimeCheck> {
  const paths = runtimePaths();
  const warnings: string[] = [];
  const errors: string[] = [];
  const files = {
    srcMain: paths.srcMain,
    srcGateway: paths.srcGateway,
    browserServer: path.join(paths.rootDir, "src", "browser", "contextvm-server.ts"),
    browserBuild: path.join(paths.rootDir, "dist", "browser", "app.js"),
    ptyAttach: path.join(paths.rootDir, "scripts", "pty-attach.py"),
  };
  const commands = {
    bun: Bun.which("bun"),
    tmux: Bun.which("tmux"),
    python3: Bun.which("python3"),
    nak: Bun.which("nak"),
    csh: Bun.which("csh"),
  };

  for (const [label, candidate] of Object.entries(files)) {
    if (!(await Bun.file(candidate).exists())) {
      errors.push(`Missing ${label}: ${candidate}`);
    }
  }

  if (!commands.bun) {
    errors.push("Missing bun in PATH.");
  }
  if (!commands.tmux) {
    errors.push("Missing tmux in PATH.");
  }
  if (!commands.python3) {
    errors.push("Missing python3 in PATH.");
  }
  if (!commands.nak) {
    warnings.push("nak is not in PATH; loopback relay verification and local test-relay helpers will be unavailable.");
  }
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    warnings.push("Running as root is discouraged; prefer a dedicated non-root service account.");
  }

  return { warnings, errors, commands, files };
}

function shouldUseJson(parsed: ParsedArgs): boolean {
  return parsed.flags.json === true;
}

function printHumanCheck(title: string, payload: {
  ok: boolean;
  mode?: string;
  configPath?: string;
  warnings: string[];
  errors: string[];
  notes?: string[];
}): void {
  console.log(`${title}: ${payload.ok ? "ok" : "needs attention"}`);
  if (payload.mode) {
    console.log(`Mode: ${payload.mode}`);
  }
  if (payload.configPath) {
    console.log(`Config: ${payload.configPath}`);
  }
  if (payload.notes) {
    for (const note of payload.notes) {
      console.log(note);
    }
  }
  if (payload.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of payload.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (payload.errors.length > 0) {
    console.log("Errors:");
    for (const error of payload.errors) {
      console.log(`- ${error}`);
    }
  }
}

function loopbackRelayWarnings(config: AppConfig): string[] {
  const warnings: string[] = [];

  for (const relay of config.relays) {
    try {
      const url = new URL(relay);
      if ((url.hostname === "127.0.0.1" || url.hostname === "localhost") && !Bun.which("nak")) {
        warnings.push(`Relay ${relay} is loopback-only and nak is unavailable for local relay startup.`);
      }
    } catch {
      warnings.push(`Relay URL could not be parsed: ${relay}`);
    }
  }

  return warnings;
}

function installNotes(): string[] {
  const prefix = defaultInstallPrefix();
  const paths = installPaths(prefix);
  const current = Bun.which("csh");
  const notes = [
    `Install prefix: ${prefix}`,
    `Expected launcher: ${paths.launcherPath}`,
    `Resolved csh in PATH: ${current ?? "(not installed on PATH)"}`,
    `Upgrade: csh upgrade${prefix === defaultInstallPrefix() ? "" : ` --prefix ${prefix}`}`,
    `Uninstall: csh uninstall${prefix === defaultInstallPrefix() ? "" : ` --prefix ${prefix}`}`,
  ];

  if (!process.env.PATH?.split(path.delimiter).includes(paths.binDir)) {
    notes.push(`PATH does not currently include ${paths.binDir}`);
  }

  return notes;
}

function browserUrl(config: AppConfig): string {
  return `http://${config.browserHost}:${config.browserPort}`;
}

function printStatus(config: AppConfig, mode: "host" | "client" | "full", runtime: RuntimeCheck, parsed: ParsedArgs): void {
  const payload = {
    version: packageVersion(),
    mode,
    configPath: config.envFilePath,
    relays: config.relays,
    serverPubkey: config.serverPubkey || "(host-only config)",
    browser: {
      url: browserUrl(config),
      allowRemote: config.browserAllowRemote,
      authUser: config.browserAuthUser || "(generated at bootstrap or required for remote mode)",
      scrollbackLines: config.scrollbackLines,
    },
    install: {
      prefix: defaultInstallPrefix(),
      ...installPaths(),
      resolvedCommand: runtime.commands.csh,
    },
    runtime: runtime,
  };

  if (shouldUseJson(parsed)) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`csh ${payload.version}`);
  console.log(`Config: ${payload.configPath}`);
  console.log(`Mode: ${payload.mode}`);
  console.log(`Relays: ${payload.relays.join(", ")}`);
  console.log(`Server pubkey: ${payload.serverPubkey}`);
  console.log(`Browser: ${payload.browser.url}`);
  console.log(`Browser auth user: ${payload.browser.authUser}`);
  console.log(`Scrollback lines: ${payload.browser.scrollbackLines}`);
  console.log(`Installed command: ${payload.install.resolvedCommand ?? "(not on PATH)"}`);
  if (runtime.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of runtime.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

async function commandInstall(parsed: ParsedArgs): Promise<void> {
  await commandInstallAction("install", parsed);
}

async function commandUpgrade(parsed: ParsedArgs): Promise<void> {
  await commandInstallAction("upgrade", parsed);
}

async function commandUninstall(parsed: ParsedArgs): Promise<void> {
  await commandInstallAction("uninstall", parsed);
}

async function commandInstallAction(action: "install" | "upgrade" | "uninstall", parsed: ParsedArgs): Promise<void> {
  const args: string[] = [];
  args.push(action);
  if (typeof parsed.flags.prefix === "string") {
    args.push("--prefix", parsed.flags.prefix);
  }
  if (parsed.flags.force === true) {
    args.push("--force");
  }
  if (parsed.flags["no-runtime"] === true) {
    args.push("--no-runtime");
  }
  const code = await runCommand("bash", ["scripts/install-cli.sh", ...args]);
  process.exit(code);
}

async function commandBootstrap(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  mkdirSync(path.dirname(configPath), { recursive: true });
  const result = writeBootstrapEnv(configPath);
  console.log(`Wrote ${result.outputFile}`);
  console.log(`Allowed client pubkey: ${result.allowedClientPubkey}`);
  console.log("Next steps:");
  console.log(`- csh doctor --config ${result.outputFile}`);
  console.log(`- csh host start --config ${result.outputFile}`);
}

async function commandRuntimeInstall(): Promise<void> {
  const code = await runCommand("bash", ["scripts/install-runtime.sh"]);
  process.exit(code);
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
  const runtime = await gatherRuntimeCheck();
  const warnings = [...check.warnings, ...runtime.warnings];
  const errors = [...check.errors, ...runtime.errors];

  if (shouldUseJson(parsed)) {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      configPath,
      mode: "host",
      warnings,
      errors,
      runtime,
    }, null, 2));
  } else {
    printHumanCheck("csh host check", {
      ok: errors.length === 0,
      mode: "host",
      configPath,
      warnings,
      errors,
    });
  }

  if (errors.length > 0) {
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

async function commandStatus(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  const config = loadConfig(configPath);
  const mode = resolveConfigMode(config, parsed);
  const runtime = await gatherRuntimeCheck();
  runtime.warnings.push(...loopbackRelayWarnings(config));
  printStatus(config, mode, runtime, parsed);
}

async function commandDoctor(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  const config = loadConfig(configPath);
  const mode = resolveConfigMode(config, parsed);
  const check = validateConfig(config, mode);
  const runtime = await gatherRuntimeCheck();
  const warnings = [...check.warnings, ...runtime.warnings, ...loopbackRelayWarnings(config)];
  const errors = [...check.errors, ...runtime.errors];
  const notes = [
    ...installNotes(),
    `Browser URL: ${browserUrl(config)}`,
    `systemd unit: csh host systemd-unit --config ${configPath} --output /tmp/csh-host.service`,
  ];

  if (shouldUseJson(parsed)) {
    console.log(JSON.stringify({
      ok: errors.length === 0,
      mode,
      configPath,
      warnings,
      errors,
      notes,
      runtime,
    }, null, 2));
  } else {
    printHumanCheck("csh doctor", {
      ok: errors.length === 0,
      mode,
      configPath,
      warnings,
      errors,
      notes,
    });
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

async function commandConfigCheck(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[2]);
  const config = loadConfig(configPath);
  const mode = resolveConfigMode(config, parsed);
  const check = validateConfig(config, mode);

  if (shouldUseJson(parsed)) {
    console.log(JSON.stringify({
      ok: check.ok,
      configPath,
      mode,
      warnings: check.warnings,
      errors: check.errors,
    }, null, 2));
  } else {
    printHumanCheck("csh config check", {
      ok: check.ok,
      mode,
      configPath,
      warnings: check.warnings,
      errors: check.errors,
    });
  }

  if (!check.ok) {
    process.exit(1);
  }
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
      const result = await pollSession(client, session.sessionId, cursor, true);
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
      const reconnectHint = `csh shell --session ${session.sessionId} --config ${configPath}`;
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
  const config = requireHealthyConfig(configPath, "client");
  process.env.CVM_ENV_FILE = configPath;
  loadEnvFile(configPath);
  console.error(`Browser URL: ${browserUrl(config)}`);
  console.error(`Scrollback lines: ${config.scrollbackLines}`);
  if (config.browserAuthUser && config.browserAuthPassword) {
    console.error(`Browser auth user: ${config.browserAuthUser}`);
    console.error(`Browser auth password: read from ${configPath}`);
  } else {
    console.error("Browser auth credentials will be generated at startup because none are set in the config.");
  }
  console.error("Use Ctrl-C in this terminal to stop the local browser bridge.");
  const code = await runCommand("bun", ["run", "src/browser/contextvm-server.ts"]);
  process.exit(code);
}

async function commandBrowserLocal(): Promise<void> {
  const host = process.env.CSH_BROWSER_HOST || "127.0.0.1";
  const port = process.env.CSH_BROWSER_PORT || "4318";
  const scrollback = process.env.CSH_SCROLLBACK_LINES || "10000";
  console.error(`Browser URL: http://${host}:${port}`);
  console.error(`Scrollback lines: ${scrollback}`);
  console.error("Browser auth credentials will be generated at startup if they are not already set in the environment.");
  console.error("Use Ctrl-C in this terminal to stop the local browser bridge.");
  const code = await runCommand("bun", ["run", "src/browser/server.ts"]);
  process.exit(code);
}

async function commandVerify(parsed: ParsedArgs): Promise<void> {
  const configPath = configPathFrom(parsed, parsed.positionals[1]);
  requireHealthyConfig(configPath, "full");
  const code = await runCommand("bash", ["scripts/run-autonomous-loop.sh", configPath]);
  process.exit(code);
}

function completionScript(shell: string): string {
  const commands = [
    "install",
    "upgrade",
    "uninstall",
    "bootstrap",
    "version",
    "status",
    "doctor",
    "completion",
    "config",
    "runtime",
    "host",
    "direct",
    "lifecycle",
    "proxy",
    "exec",
    "shell",
    "browser",
    "browser-local",
    "verify",
    "help",
  ];
  const flags = [
    "--config",
    "--mode",
    "--session",
    "--output",
    "--prefix",
    "--user",
    "--group",
    "--json",
    "--force",
    "--no-runtime",
    "--close-on-exit",
  ];

  if (shell === "bash") {
    return `# bash completion for csh
_csh_complete() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "\${prev}" in
    --config)
      COMPREPLY=( $(compgen -f -- "\${cur}") )
      return 0
      ;;
    --mode)
      COMPREPLY=( $(compgen -W "auto host client full" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
  esac

  if [[ "\${cur}" == --* ]]; then
    COMPREPLY=( $(compgen -W "${flags.join(" ")}" -- "\${cur}") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "${commands.join(" ")}" -- "\${cur}") )
}
complete -F _csh_complete csh
`;
  }

  if (shell === "zsh") {
    return `#compdef csh
_csh() {
  local -a commands
  commands=(${commands.map((command) => `'${command}'`).join(" ")})

  _arguments \\
    '--config[config file]:file:_files' \\
    '--mode[validation mode]:mode:(auto host client full)' \\
    '--session[session id]:session id:' \\
    '--output[output path]:file:_files' \\
    '--prefix[install prefix]:directory:_files -/' \\
    '--user[systemd user]:user:' \\
    '--group[systemd group]:group:' \\
    '--json[emit json]' \\
    '--force[overwrite existing launcher]' \\
    '--no-runtime[skip runtime refresh]' \\
    '--close-on-exit[close remote shell on disconnect]' \\
    '1:command:->command' \\
    '*::arg:->args'

  case $state in
    command)
      _describe 'command' commands
      ;;
    args)
      if [[ $words[2] == completion ]]; then
        _values 'shell' bash zsh fish
      fi
      ;;
  esac
}
_csh "$@"
`;
  }

  if (shell === "fish") {
    return `${commands
      .map((command) => `complete -c csh -f -a ${command}`)
      .join("\n")}
complete -c csh -l config -r
complete -c csh -l mode -a "auto host client full"
complete -c csh -l session -r
complete -c csh -l output -r
complete -c csh -l prefix -r
complete -c csh -l user -r
complete -c csh -l group -r
complete -c csh -l json
complete -c csh -l force
complete -c csh -l no-runtime
complete -c csh -l close-on-exit
`;
  }

  throw new Error(`Unsupported shell: ${shell}`);
}

async function commandCompletion(parsed: ParsedArgs): Promise<void> {
  const shell = parsed.positionals[1];
  if (!shell) {
    throw new Error("completion requires a shell name: bash, zsh, or fish.");
  }
  process.stdout.write(completionScript(shell));
}

async function commandVersion(): Promise<void> {
  console.log(`csh ${packageVersion()}`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const [command, subcommand] = parsed.positionals;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }

  if (command === "install") {
    await commandInstall(parsed);
    return;
  }
  if (command === "upgrade") {
    await commandUpgrade(parsed);
    return;
  }
  if (command === "uninstall") {
    await commandUninstall(parsed);
    return;
  }
  if (command === "bootstrap") {
    await commandBootstrap(parsed);
    return;
  }
  if (command === "version") {
    await commandVersion();
    return;
  }
  if (command === "status") {
    await commandStatus(parsed);
    return;
  }
  if (command === "doctor") {
    await commandDoctor(parsed);
    return;
  }
  if (command === "completion") {
    await commandCompletion(parsed);
    return;
  }
  if (command === "config" && subcommand === "check") {
    await commandConfigCheck(parsed);
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
