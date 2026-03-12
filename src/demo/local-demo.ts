import path from "node:path";

process.env.CSH_TMUX_SOCKET = path.join(
  process.cwd(),
  ".csh-runtime",
  `tmux-demo-${process.pid}.sock`,
);

const { TmuxSessionManager } = await import("../server/tmux-session-manager.js");
const manager = new TmuxSessionManager();
const doneMarker = "__CSH_DEMO_DONE__";

let sessionId: string | undefined;

try {
  console.log("Opening local tmux-backed shell session...");

  const session = await manager.openSession({
    command: "/bin/sh",
    cols: 100,
    rows: 28,
    ownerId: "local-demo",
  });

  sessionId = session.sessionId;

  console.log(`Opened session ${session.sessionId}`);
  console.log(`Shell command: ${session.command}`);

  await manager.writeToSession(
    session.sessionId,
    `printf 'csh local demo ready\\n'; pwd; uname -s; printf '${doneMarker}\\n'\n`,
    "local-demo",
  );

  console.log("Polling for terminal output...");
  const snapshot = await pollForSnapshot(session.sessionId, "local-demo", doneMarker);

  console.log("\nSnapshot:\n");
  console.log(snapshot.trimEnd());
} finally {
  if (sessionId) {
    await manager.closeSession(sessionId, "local-demo");
  }
}

async function pollForSnapshot(
  sessionId: string,
  ownerId: string,
  expectedText: string,
): Promise<string> {
  let snapshot = "";

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await manager.pollSession(sessionId, ownerId);
    snapshot = result.snapshot ?? snapshot;

    if (snapshot.includes(expectedText)) {
      return snapshot;
    }

    await Bun.sleep(50);
  }

  throw new Error(`Timed out waiting for terminal output containing: ${expectedText}`);
}
