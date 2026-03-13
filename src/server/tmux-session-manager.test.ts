import { afterEach, describe, expect, test } from "bun:test";
import { TmuxSessionManager } from "./tmux-session-manager.js";

const manager = new TmuxSessionManager();
const openSessions: string[] = [];

afterEach(async () => {
  while (openSessions.length > 0) {
    const sessionId = openSessions.pop();
    if (!sessionId) {
      continue;
    }

    try {
      await manager.closeSession(sessionId, "test");
    } catch {
      // Ignore cleanup failures for already-closed test sessions.
    }
  }
});

describe("TmuxSessionManager", () => {
  test("opens, writes, polls, and closes a shell session", async () => {
    const doneMarker = "__CSH_TEST_DONE__";
    const session = await manager.openSession({
      command: "/bin/sh",
      cols: 80,
      rows: 24,
      ownerId: "test",
    });
    openSessions.push(session.sessionId);

    await manager.writeToSession(
      session.sessionId,
      `printf 'hello from csh test\\n'; printf '${doneMarker}\\n'\n`,
      "test",
    );

    let snapshot = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await manager.pollSession(session.sessionId, "test");
      snapshot = result.snapshot ?? snapshot;
      if (snapshot.includes(doneMarker)) {
        break;
      }
      await Bun.sleep(50);
    }

    expect(snapshot).toContain("hello from csh test");
    expect(snapshot).toContain(doneMarker);

    await manager.closeSession(session.sessionId, "test");
    openSessions.pop();
  });

  test("rejects access from a different owner", async () => {
    const session = await manager.openSession({
      command: "/bin/sh",
      ownerId: "alice",
    });
    openSessions.push(session.sessionId);

    await expect(
      manager.writeToSession(session.sessionId, "printf 'nope'\n", "bob"),
    ).rejects.toThrow("owned by a different actor");
  });

  test("reports closed state after the shell exits", async () => {
    const session = await manager.openSession({
      command: "/bin/sh",
      ownerId: "test",
    });
    openSessions.push(session.sessionId);

    await manager.writeToSession(session.sessionId, "exit\n", "test");

    let result = await manager.pollSession(session.sessionId, "test");
    for (let attempt = 0; attempt < 20 && !result.session.closedAt; attempt += 1) {
      await Bun.sleep(50);
      result = await manager.pollSession(session.sessionId, "test", result.revision);
    }

    expect(result.session.closedAt).toBeDefined();
    expect([0, null, undefined]).toContain(result.session.exitStatus);
  });

  test("interrupts the foreground command with SIGINT", async () => {
    const doneMarker = "__CSH_SIGINT_DONE__";
    const session = await manager.openSession({
      command: "/bin/sh",
      ownerId: "test",
    });
    openSessions.push(session.sessionId);

    await manager.writeToSession(session.sessionId, "sleep 5\n", "test");
    await Bun.sleep(150);
    await manager.signalSession(session.sessionId, "SIGINT", "test");
    await manager.writeToSession(
      session.sessionId,
      `printf '${doneMarker}\\n'\n`,
      "test",
    );

    let snapshot = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await manager.pollSession(session.sessionId, "test");
      snapshot = result.snapshot ?? snapshot;
      if (snapshot.includes(doneMarker)) {
        break;
      }
      await Bun.sleep(50);
    }

    expect(snapshot).toContain(doneMarker);
  });
});
