import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.join(import.meta.dir, "..", "..");

type SessionOpenResult = {
  sessionId: string;
  cols: number;
  rows: number;
  ownerId: string;
  command: string;
  revision: number;
};

type SessionPollResult = {
  sessionId: string;
  changed: boolean;
  cursor: number;
  snapshot?: string;
  snapshotBase64?: string;
  delta?: string;
  deltaBase64?: string;
  cols: number;
  rows: number;
  closedAt: string | null;
  exitStatus: number | null;
};

type ManagerHarness = {
  manager: {
    openSession(input: Record<string, unknown>): Promise<SessionOpenResult>;
    writeToSession(sessionId: string, actorId: string, input?: string, inputBase64?: string): Promise<unknown>;
    resizeSession(sessionId: string, cols: number, rows: number, actorId: string): Promise<unknown>;
    signalSession(sessionId: string, signalName: NodeJS.Signals, actorId: string): Promise<unknown>;
    pollSession(sessionId: string, actorId: string, cursor?: number, keepAlive?: boolean): Promise<{
      session: {
        sessionId: string;
        cols: number;
        rows: number;
        closedAt?: string;
        exitStatus?: number | null;
      };
      changed: boolean;
      revision: number;
      snapshot?: string;
      snapshotBase64?: string;
      delta?: string;
      deltaBase64?: string;
    }>;
    closeSession(sessionId: string, actorId: string): Promise<unknown>;
    shutdown(): Promise<void>;
  };
  rootDir: string;
  close(): Promise<void>;
};

describe("session contract", () => {
  serialTest("opens a named session and returns the requested metadata", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "named-open",
        command: "/bin/sh",
        cols: 90,
        rows: 30,
        ownerId: "owner-a",
      });

      expect(opened.sessionId).toBe("named-open");
      expect(opened.ownerId).toBe("owner-a");
      expect(opened.cols).toBe(90);
      expect(opened.rows).toBe(30);
      expect(opened.command).toContain("/bin/sh");
    } finally {
      await harness.close();
    }
  });

  serialTest("rejects access from a different owner", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "owner-check",
        ownerId: "owner-a",
        command: "/bin/sh",
      });

      await expect(
        harness.manager.pollSession(opened.sessionId, "owner-b"),
      ).rejects.toThrow(/different actor/);
    } finally {
      await harness.close();
    }
  });

  serialTest("accepts byte-safe writes through inputBase64 without UTF-8 coercion", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "byte-safe",
        ownerId: "owner-a",
        command: "/bin/sh -lc 'stty raw -echo; od -An -tx1 -N4'",
        cols: 80,
        rows: 24,
      });
      await Bun.sleep(100);
      const startCursor = opened.revision;

      await harness.manager.writeToSession(
        opened.sessionId,
        "owner-a",
        undefined,
        Buffer.from([0x00, 0xff, 0x41, 0x1b]).toString("base64"),
      );

      const result = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => sessionText(poll)?.includes("00 ff 41 1b") === true,
        startCursor,
      );

      expect(sessionText(result)).toContain("00 ff 41 1b");
    } finally {
      await harness.close();
    }
  });

  serialTest("updates shell-visible terminal size after session_resize", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "resize-check",
        ownerId: "owner-a",
        command: "/bin/sh",
        cols: 80,
        rows: 24,
      });
      await Bun.sleep(100);
      const startCursor = opened.revision;

      await harness.manager.resizeSession(opened.sessionId, 120, 40, "owner-a");
      await harness.manager.writeToSession(
        opened.sessionId,
        "owner-a",
        "stty size\nprintf '__SIZE_DONE__\n'\n",
      );

      const result = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => {
          const snapshot = sessionText(poll);
          return snapshot?.includes("40 120") === true && snapshot.includes("__SIZE_DONE__");
        },
        startCursor,
      );

      expect(sessionText(result)).toContain("40 120");
    } finally {
      await harness.close();
    }
  });

  serialTest("reports the remote exit status after a direct command exits", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "exit-status",
        ownerId: "owner-a",
        command: "/bin/sh -lc 'printf __EXIT__\\\\n; exit 7'",
        cols: 80,
        rows: 24,
      });

      const result = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => poll.closedAt !== null,
        opened.revision,
      );

      expect(snapshotText(result)).toContain("__EXIT__");
      expect(result.exitStatus).toBe(7);
    } finally {
      await harness.close();
    }
  });

  serialTest("reuses a named live session for reconnect", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "named-reconnect",
        ownerId: "owner-a",
        command: "/bin/sh",
      });
      await Bun.sleep(100);
      const startCursor = opened.revision;
      await harness.manager.writeToSession(opened.sessionId, "owner-a", "cd /tmp\npwd\n");
      const first = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => sessionText(poll)?.includes("/tmp") === true,
        startCursor,
      );

      const reopened = await harness.manager.openSession({
        sessionId: "named-reconnect",
        ownerId: "owner-a",
        command: "/bin/sh",
      });
      await harness.manager.writeToSession(reopened.sessionId, "owner-a", "pwd\n");
      const second = await waitForPoll(
        harness.manager,
        reopened.sessionId,
        "owner-a",
        (poll) => sessionText(poll)?.includes("/tmp") === true,
        first.cursor,
      );

      expect(reopened.sessionId).toBe(opened.sessionId);
      expect(sessionText(second)).toContain("/tmp");
    } finally {
      await harness.close();
    }
  });

  serialTest("returns stream deltas after the caller advances the cursor", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "delta-check",
        ownerId: "owner-a",
        command: "/bin/sh",
      });
      await Bun.sleep(100);
      const startCursor = opened.revision;
      await harness.manager.writeToSession(opened.sessionId, "owner-a", "printf '__DELTA__one\\n'\n");
      const first = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => sessionText(poll)?.includes("__DELTA__one") === true,
        startCursor,
      );

      await harness.manager.writeToSession(opened.sessionId, "owner-a", "printf '__DELTA__two\\n'\n");
      const second = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => deltaText(poll)?.includes("__DELTA__two") === true,
        first.cursor,
      );

      expect(deltaText(second)).toContain("__DELTA__two");
    } finally {
      await harness.close();
    }
  });

  serialTest("recovers a named session across manager restart", async () => {
    const rootDir = createHarnessRoot();
    const first = await startHarness(rootDir, false);

    try {
      const opened = await first.manager.openSession({
        sessionId: "restart-recovery",
        ownerId: "owner-a",
        command: "/bin/sh",
      });
      await Bun.sleep(100);
      const startCursor = opened.revision;
      await first.manager.writeToSession(opened.sessionId, "owner-a", "cd /tmp\npwd\n");
      const beforeRestart = await waitForPoll(
        first.manager,
        opened.sessionId,
        "owner-a",
        (poll) => sessionText(poll)?.includes("/tmp") === true,
        startCursor,
      );
      expect(sessionText(beforeRestart)).toContain("/tmp");

      const second = await startHarness(rootDir, false);
      try {
        const reopened = await second.manager.openSession({
          sessionId: "restart-recovery",
          ownerId: "owner-a",
          command: "/bin/sh",
        });
        await second.manager.writeToSession(reopened.sessionId, "owner-a", "pwd\n");
        const afterRestart = await waitForPoll(
          second.manager,
          reopened.sessionId,
          "owner-a",
          (poll) => sessionText(poll)?.includes("/tmp") === true,
          reopened.revision,
          10_000,
        );

        expect(sessionText(afterRestart)).toContain("/tmp");
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  serialTest("preserves scrollback for high-output commands", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "high-output",
        ownerId: "owner-a",
        command: "python3 -c 'for i in range(300): print(f\"LINE:{i:04d}\")'",
        cols: 120,
        rows: 40,
      });

      const result = await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => {
          const snapshot = snapshotText(poll) ?? "";
          return (
            poll.closedAt !== null &&
            snapshot.includes("LINE:0000") &&
            snapshot.includes("LINE:0299")
          );
        },
        opened.revision,
        10_000,
      );
      const snapshot = snapshotText(result) ?? "";

      expect(snapshot).toContain("LINE:0000");
      expect(snapshot).toContain("LINE:0299");
    } finally {
      await harness.close();
    }
  });

  serialTest("evicts closed sessions after the closed-session TTL", async () => {
    const harness = await startHarness();

    try {
      const opened = await harness.manager.openSession({
        sessionId: "closed-ttl",
        ownerId: "owner-a",
        command: "/bin/sh -lc 'exit 0'",
      });
      await waitForPoll(
        harness.manager,
        opened.sessionId,
        "owner-a",
        (poll) => poll.closedAt !== null,
        opened.revision,
      );

      await Bun.sleep(2_200);

      await expect(
        harness.manager.pollSession(opened.sessionId, "owner-a"),
      ).rejects.toThrow(/Unknown session/);
    } finally {
      await harness.close();
    }
  });
});

let testChain = Promise.resolve();

function serialTest(name: string, fn: () => Promise<void>): void {
  test(name, () => runSerial(fn));
}

function runSerial<T>(fn: () => Promise<T>): Promise<T> {
  const current = testChain.then(fn, fn);
  testChain = current.then(
    () => undefined,
    () => undefined,
  );
  return current;
}

async function startHarness(rootDir = createHarnessRoot(), cleanupRoot = true): Promise<ManagerHarness> {
  const manager = await loadManager(rootDir);

  return {
    manager,
    rootDir,
    async close() {
      for (const entry of readdirSync(path.join(rootDir, "sessions"), { withFileTypes: true })) {
        if (!entry.isDirectory()) {
          continue;
        }
        const sessionPath = path.join(rootDir, "sessions", entry.name, "session.json");
        try {
          const session = JSON.parse(readFileSync(sessionPath, "utf8")) as { ownerId?: string };
          if (session.ownerId) {
            await manager.closeSession(entry.name, session.ownerId).catch(() => undefined);
          }
        } catch {
          // ignore best-effort cleanup
        }
      }
      await manager.shutdown();
      if (cleanupRoot) {
        rmSync(rootDir, { recursive: true, force: true });
      }
    },
  };
}

async function loadManager(rootDir: string): Promise<ManagerHarness["manager"]> {
  process.env.CSH_SESSION_STATE_DIR = path.join(rootDir, "sessions");
  process.env.CSH_SESSION_IDLE_TTL_SECONDS = "2";
  process.env.CSH_CLOSED_SESSION_TTL_SECONDS = "1";
  process.env.CSH_SESSION_SCAVENGE_INTERVAL_SECONDS = "1";
  process.env.CSH_SCROLLBACK_LINES = "10000";

  mkdirSync(process.env.CSH_SESSION_STATE_DIR, { recursive: true });

  const moduleUrl =
    `${pathToFileURL(path.join(REPO_ROOT, "src", "server", "pty-session-manager.ts")).href}?t=${Date.now()}-${Math.random()}`;
  const module = await import(moduleUrl);
  return new module.PtySessionManager();
}

function createHarnessRoot(): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), "csh-phase7-"));
  mkdirSync(path.join(rootDir, "sessions"), { recursive: true });
  return rootDir;
}

async function waitForPoll(
  manager: ManagerHarness["manager"],
  sessionId: string,
  ownerId: string,
  predicate: (poll: SessionPollResult) => boolean,
  cursor?: number,
  timeoutMs = 5_000,
): Promise<SessionPollResult> {
  const startedAt = Date.now();
  let nextCursor = cursor;
  let last: SessionPollResult | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const poll = await normalizePoll(
      await manager.pollSession(sessionId, ownerId, nextCursor, true),
    );
    nextCursor = poll.cursor;
    last = poll;

    if (predicate(poll)) {
      return poll;
    }

    await Bun.sleep(50);
  }

  throw new Error(`Timed out waiting for session ${sessionId}: ${JSON.stringify(last, null, 2)}`);
}

async function normalizePoll(raw: Awaited<ReturnType<ManagerHarness["manager"]["pollSession"]>>): Promise<SessionPollResult> {
  return {
    sessionId: raw.session.sessionId,
    changed: raw.changed,
    cursor: raw.revision,
    snapshot: raw.snapshot,
    snapshotBase64: raw.snapshotBase64,
    delta: raw.delta,
    deltaBase64: raw.deltaBase64,
    cols: raw.session.cols,
    rows: raw.session.rows,
    closedAt: raw.session.closedAt ?? null,
    exitStatus: raw.session.exitStatus ?? null,
  };
}

function snapshotText(result: SessionPollResult): string | null {
  if (result.snapshotBase64) {
    return Buffer.from(result.snapshotBase64, "base64").toString("utf8");
  }

  return result.snapshot ?? null;
}

function deltaText(result: SessionPollResult): string | null {
  if (result.deltaBase64) {
    return Buffer.from(result.deltaBase64, "base64").toString("utf8");
  }

  return result.delta ?? null;
}

function sessionText(result: SessionPollResult): string | null {
  return snapshotText(result) ?? deltaText(result);
}
