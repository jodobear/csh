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
      await manager.closeSession(sessionId);
    } catch {
      // Ignore cleanup failures for already-closed test sessions.
    }
  }
});

describe("TmuxSessionManager", () => {
  test("opens, writes, polls, and closes a shell session", async () => {
    const session = await manager.openSession({
      cols: 80,
      rows: 24,
      ownerId: "test",
    });
    openSessions.push(session.sessionId);

    await manager.writeToSession(session.sessionId, "printf 'hello from csh test'\\r");

    let snapshot = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await manager.pollSession(session.sessionId);
      snapshot = result.snapshot ?? snapshot;
      if (snapshot.includes("hello from csh test")) {
        break;
      }
      await Bun.sleep(50);
    }

    expect(snapshot).toContain("hello from csh test");

    await manager.closeSession(session.sessionId);
    openSessions.pop();
  });
});
