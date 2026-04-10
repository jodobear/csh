#!/usr/bin/env bun
import { spawn } from "node:child_process";

const DEFAULT_PLAYWRIGHT_WRAPPER =
  process.env.CSH_PLAYWRIGHT_WRAPPER ||
  `${process.env.HOME || "/home/at"}/.codex/skills/playwright/scripts/playwright_cli.sh`;

export async function runPlaywright(
  args: string[],
  options: {
    session: string;
    cwd?: string;
    env?: Record<string, string>;
  },
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(DEFAULT_PLAYWRIGHT_WRAPPER, ["--session", options.session, ...args], {
      cwd: options.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright command exited via signal ${signal}: ${stderr}`));
        return;
      }
      if ((code ?? 0) !== 0) {
        reject(
          new Error(
            `Playwright command failed (${code ?? 1}): ${[stdout, stderr].filter(Boolean).join("\n")}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function parsePlaywrightResult<T>(output: string): T {
  const match = output.match(/### Result\s+([\s\S]*?)(?:\n### |\s*$)/);
  if (!match) {
    throw new Error(`Playwright output did not include a result block:\n${output}`);
  }

  const payload = match[1].trim();
  try {
    return JSON.parse(payload) as T;
  } catch {
    return payload as T;
  }
}

export function parsePlaywrightPageUrl(output: string): string | null {
  const match = output.match(/- Page URL: ([^\n]+)/);
  return match?.[1]?.trim() ?? null;
}

export async function waitForPlaywrightSnapshot(
  session: string,
  predicate: (snapshot: string) => boolean,
  options: {
    cwd?: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    pollMs?: number;
  } = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const pollMs = options.pollMs ?? 250;
  const startedAt = Date.now();
  let lastSnapshot = "";

  while (Date.now() - startedAt < timeoutMs) {
    lastSnapshot = await runPlaywright(["snapshot"], {
      session,
      cwd: options.cwd,
      env: options.env,
    });
    if (predicate(lastSnapshot)) {
      return lastSnapshot;
    }
    await Bun.sleep(pollMs);
  }

  throw new Error(`Timed out waiting for browser snapshot state:\n${lastSnapshot}`);
}
