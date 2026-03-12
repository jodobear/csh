import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TMUX_HISTORY_START = "-2000";
const TMUX_SOCKET_PATH =
  process.env.CSH_TMUX_SOCKET ??
  path.join(process.cwd(), ".csh-runtime", "tmux.sock");

export type ShellSession = {
  sessionId: string;
  tmuxSessionName: string;
  paneTarget: string;
  paneTty: string;
  panePid: number;
  ownerId: string;
  command: string;
  cwd?: string;
  cols: number;
  rows: number;
  revision: number;
  lastSnapshot: string;
  createdAt: string;
  lastActivityAt: string;
  closedAt?: string;
  exitStatus?: number | null;
};

export type OpenSessionInput = {
  command?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  ownerId?: string;
};

export type PollResult = {
  session: ShellSession;
  changed: boolean;
  revision: number;
  snapshot?: string;
};

export class TmuxSessionManager {
  private readonly sessions = new Map<string, ShellSession>();

  public async openSession(input: OpenSessionInput): Promise<ShellSession> {
    const sessionId = randomUUID();
    const tmuxSessionName = `csh-${sessionId}`;
    const cols = clampDimension(input.cols, 80);
    const rows = clampDimension(input.rows, 24);
    const ownerId = input.ownerId ?? "local";
    const command = input.command ?? `${process.env.SHELL ?? "/bin/bash"} -i`;

    const args = ["new-session", "-d", "-s", tmuxSessionName, "-x", String(cols), "-y", String(rows)];
    if (input.cwd) {
      args.push("-c", input.cwd);
    }
    args.push(command);

    await runTmux(args);

    const paneInfo = await getPaneInfo(tmuxSessionName);
    const createdAt = new Date().toISOString();

    const session: ShellSession = {
      sessionId,
      tmuxSessionName,
      paneTarget: paneInfo.target,
      paneTty: paneInfo.tty,
      panePid: paneInfo.pid,
      ownerId,
      command,
      cwd: input.cwd,
      cols,
      rows,
      revision: 0,
      lastSnapshot: "",
      createdAt,
      lastActivityAt: createdAt,
      exitStatus: null,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public getSession(sessionId: string): ShellSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    return session;
  }

  public async writeToSession(sessionId: string, input: string): Promise<ShellSession> {
    const session = this.getSession(sessionId);
    const tty = await open(session.paneTty, "w");

    try {
      await tty.write(input);
    } finally {
      await tty.close();
    }

    session.lastActivityAt = new Date().toISOString();
    return session;
  }

  public async resizeSession(sessionId: string, cols: number, rows: number): Promise<ShellSession> {
    const session = this.getSession(sessionId);

    session.cols = clampDimension(cols, session.cols);
    session.rows = clampDimension(rows, session.rows);
    session.lastActivityAt = new Date().toISOString();

    await runTmux([
      "resize-window",
      "-t",
      session.tmuxSessionName,
      "-x",
      String(session.cols),
      "-y",
      String(session.rows),
    ]);

    return session;
  }

  public async signalSession(sessionId: string, signalName: NodeJS.Signals): Promise<ShellSession> {
    const session = this.getSession(sessionId);
    process.kill(session.panePid, signalName);
    session.lastActivityAt = new Date().toISOString();
    return session;
  }

  public async pollSession(sessionId: string, cursor?: number): Promise<PollResult> {
    const session = this.getSession(sessionId);
    const snapshot = await capturePane(session.paneTarget);

    if (snapshot !== session.lastSnapshot) {
      session.revision += 1;
      session.lastSnapshot = snapshot;
    }

    const requestedRevision = cursor ?? -1;
    const changed = requestedRevision !== session.revision;

    return {
      session,
      changed,
      revision: session.revision,
      snapshot: changed ? session.lastSnapshot : undefined,
    };
  }

  public async closeSession(sessionId: string): Promise<ShellSession> {
    const session = this.getSession(sessionId);
    await runTmux(["kill-session", "-t", session.tmuxSessionName]);
    session.closedAt = new Date().toISOString();
    this.sessions.delete(sessionId);
    return session;
  }
}

async function capturePane(paneTarget: string): Promise<string> {
  const { stdout } = await runTmux([
    "capture-pane",
    "-p",
    "-e",
    "-J",
    "-S",
    TMUX_HISTORY_START,
    "-t",
    paneTarget,
  ]);

  return stdout;
}

async function getPaneInfo(
  sessionName: string,
): Promise<{ target: string; tty: string; pid: number }> {
  const { stdout } = await runTmux([
    "list-panes",
    "-t",
    sessionName,
    "-F",
    "#{session_name}:#{window_index}.#{pane_index} #{pane_tty} #{pane_pid}",
  ]);
  const line = stdout.trim().split("\n")[0]?.trim();
  if (!line) {
    throw new Error(`No tmux pane found for session ${sessionName}`);
  }

  const [target, tty, pidText] = line.split(/\s+/, 3);
  return {
    target,
    tty,
    pid: Number(pidText),
  };
}

async function runTmux(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    await mkdir(path.dirname(TMUX_SOCKET_PATH), { recursive: true });
    return await execFileAsync("tmux", ["-S", TMUX_SOCKET_PATH, ...args], {
      encoding: "utf8",
    });
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error ? String(error.stderr) : String(error);
    throw new Error(`tmux ${args.join(" ")} failed: ${stderr.trim()}`);
  }
}

function clampDimension(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(20, Math.min(400, Math.trunc(value)));
}
