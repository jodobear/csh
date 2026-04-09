#!/usr/bin/env bun
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { repoRoot } from "./config";

export type FreshCheckout = {
  checkoutDir: string;
};

export async function createFreshCheckout(options: {
  sourceRepo: string;
  checkoutDir: string;
}): Promise<FreshCheckout> {
  mkdirSync(path.dirname(options.checkoutDir), { recursive: true, mode: 0o700 });
  await runCommand("git", ["clone", "--quiet", "--no-local", options.sourceRepo, options.checkoutDir], {
    cwd: path.dirname(options.checkoutDir),
  });
  return {
    checkoutDir: options.checkoutDir,
  };
}

export async function runInFreshCheckout(options: {
  checkoutDir: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}): Promise<{ exitCode: number }> {
  const exitCode = await runCommand(options.command, options.args, {
    cwd: options.checkoutDir,
    env: options.env,
    stdio: "inherit",
  });
  return { exitCode };
}

if (import.meta.main) {
  const runRoot = mkdtempSync(path.join(tmpdir(), "csh-fresh-checkout-"));
  const checkoutDir = path.join(runRoot, "repo");

  try {
    await createFreshCheckout({
      sourceRepo: repoRoot(),
      checkoutDir,
    });

    const envFile = path.join(checkoutDir, ".env.csh.local");
    const sharedEnv = {
      BUN_TMPDIR: "/tmp",
      BUN_INSTALL: "/tmp/bun-install",
    };

    const installCode = await runInFreshCheckout({
      checkoutDir,
      command: "bun",
      args: ["install", "--frozen-lockfile"],
      env: sharedEnv,
    });

    if (installCode.exitCode !== 0) {
      process.exit(installCode.exitCode);
    }

    const code = await runInFreshCheckout({
      checkoutDir,
      command: "bun",
      args: ["run", "scripts/csh.ts", "verify", envFile],
      env: {
        ...sharedEnv,
        CSH_VERIFY_BOOTSTRAP: "1",
      },
    });

    console.log(`fresh_checkout_dir=${checkoutDir}`);
    console.log(`fresh_checkout_env=${envFile}`);
    console.log(`fresh_checkout_logs=${path.join(checkoutDir, ".csh-runtime", "logs")}`);

    process.exit(code.exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    console.error(`fresh_checkout_dir=${checkoutDir}`);
    process.exit(1);
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    stdio?: "inherit" | "ignore";
  },
): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: options.stdio ?? "ignore",
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
