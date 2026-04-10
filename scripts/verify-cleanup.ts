#!/usr/bin/env bun
import { setTimeout as sleep } from "node:timers/promises";

type Candidate = {
  pid: number;
  command: string;
};

const candidates = await listCandidates();
for (const candidate of candidates) {
  await terminate(candidate.pid);
  console.error(`verify-cleanup killed pid=${candidate.pid} cmd=${candidate.command}`);
}

async function listCandidates(): Promise<Candidate[]> {
  const result = await Bun.$`ps -eo pid=,args=`.quiet();
  const text = await result.text();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates: Candidate[] = [];

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) {
      continue;
    }
    const pid = Number.parseInt(match[1], 10);
    const command = match[2];
    if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) {
      continue;
    }
    if (matchesVerifyCleanupTarget(command)) {
      candidates.push({ pid, command });
    }
  }

  return candidates;
}

function matchesVerifyCleanupTarget(command: string): boolean {
  return (
    /\bbun run src\/browser-static\/preview-server\.ts\b/.test(command) ||
    /\bnak serve --hostname 127\.0\.0\.1 --port 1055\d\b/.test(command) ||
    /pty-session\.py --session-dir \/tmp\/csh-phase7-[^ ]+\//.test(command)
  );
}

async function terminate(pid: number): Promise<void> {
  if (!isAlive(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  if (await waitForExit(pid, 1_000)) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return;
  }

  await waitForExit(pid, 1_000);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isAlive(pid)) {
      return true;
    }
    await sleep(50);
  }
  return !isAlive(pid);
}
