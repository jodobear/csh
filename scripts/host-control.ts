import { spawn } from "node:child_process";
import { chmodSync, closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

export type LoggedProcess = {
  pid: number;
};

export async function startLoggedProcess(
  command: string,
  args: string[],
  logFile: string,
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    detached?: boolean;
  },
): Promise<LoggedProcess> {
  mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 });
  const logFd = openSync(logFile, "a", 0o600);
  chmodSync(logFile, 0o600);

  try {
    const child = spawn(command, args, {
      cwd: options?.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...options?.env,
      },
      detached: options?.detached ?? false,
      stdio: ["ignore", logFd, logFd],
    });

    if (!child.pid) {
      throw new Error(`Failed to start process: ${command}`);
    }

    if (options?.detached) {
      child.unref();
    }

    return { pid: child.pid };
  } finally {
    closeSync(logFd);
  }
}

export async function waitForLogMarker(
  logFile: string,
  marker: string,
  pid: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const text = readLogFile(logFile);
    if (text.includes(marker)) {
      return;
    }

    if (!isPidAlive(pid)) {
      throw new Error(`Process ${pid} exited before becoming ready: ${marker}`);
    }

    await sleep(50);
  }

  throw new Error(`Process ${pid} did not become ready in time: ${marker}`);
}

export async function terminateProcess(
  pid: number,
  options?: {
    timeoutMs?: number;
  },
): Promise<void> {
  if (!isPidAlive(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (!isMissingProcessError(error)) {
      throw error;
    }
    return;
  }

  if (await waitForProcessExit(pid, options?.timeoutMs ?? 5_000)) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (!isMissingProcessError(error)) {
      throw error;
    }
    return;
  }

  if (await waitForProcessExit(pid, 2_000)) {
    return;
  }

  throw new Error(`Process ${pid} did not exit after SIGTERM/SIGKILL`);
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return true;
    }
    await sleep(50);
  }
  return !isPidAlive(pid);
}

function readLogFile(logFile: string): string {
  try {
    return readFileSync(logFile, "utf8");
  } catch {
    return "";
  }
}

function isMissingProcessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ESRCH"
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
