import { randomUUID } from "node:crypto";
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
    await runTmux(["set-option", "-t", tmuxSessionName, "remain-on-exit", "on"]);

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

  public async writeToSession(sessionId: string, input: string, actorId: string): Promise<ShellSession> {
    const session = await this.getOpenSessionForActor(sessionId, actorId);
    await sendInput(session.paneTarget, input);

    session.lastActivityAt = new Date().toISOString();
    return session;
  }

  public async resizeSession(
    sessionId: string,
    cols: number,
    rows: number,
    actorId: string,
  ): Promise<ShellSession> {
    const session = await this.getOpenSessionForActor(sessionId, actorId);

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

  public async signalSession(sessionId: string, signalName: NodeJS.Signals, actorId: string): Promise<ShellSession> {
    const session = await this.getOpenSessionForActor(sessionId, actorId);
    await signalPane(session, signalName);
    session.lastActivityAt = new Date().toISOString();
    return session;
  }

  public async pollSession(sessionId: string, actorId: string, cursor?: number): Promise<PollResult> {
    const session = this.getSessionForActor(sessionId, actorId);
    await this.refreshSessionState(session);

    const snapshot = session.closedAt ? session.lastSnapshot : await capturePane(session.paneTarget);

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

  public async closeSession(sessionId: string, actorId: string): Promise<ShellSession> {
    const session = this.getSessionForActor(sessionId, actorId);

    if (!session.closedAt) {
      try {
        await runTmux(["kill-session", "-t", session.tmuxSessionName]);
      } catch (error) {
        if (!isMissingTmuxTarget(error)) {
          throw error;
        }
      }

      session.closedAt = new Date().toISOString();
    }

    return session;
  }

  private getSessionForActor(sessionId: string, actorId: string): ShellSession {
    const session = this.getSession(sessionId);
    if (session.ownerId !== actorId) {
      throw new Error(`Session ${sessionId} is owned by a different actor`);
    }

    return session;
  }

  private async getOpenSessionForActor(sessionId: string, actorId: string): Promise<ShellSession> {
    const session = this.getSessionForActor(sessionId, actorId);
    await this.refreshSessionState(session);

    if (session.closedAt) {
      throw new Error(`Session ${sessionId} is already closed`);
    }

    return session;
  }

  private async refreshSessionState(session: ShellSession): Promise<void> {
    if (session.closedAt) {
      return;
    }

    const paneState = await getPaneState(session.paneTarget);
    if (paneState.kind === "missing") {
      session.closedAt = new Date().toISOString();
      session.exitStatus ??= null;
      return;
    }

    if (paneState.dead) {
      session.closedAt = session.closedAt ?? new Date().toISOString();
      session.exitStatus = paneState.exitStatus;
    }
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

async function getPaneState(
  paneTarget: string,
): Promise<{ kind: "ok"; dead: boolean; exitStatus: number | null } | { kind: "missing" }> {
  try {
    const { stdout } = await runTmux([
      "list-panes",
      "-t",
      paneTarget,
      "-F",
      "#{pane_dead} #{pane_dead_status}",
    ]);
    const line = stdout.trim().split("\n")[0]?.trim();
    if (!line) {
      return { kind: "missing" };
    }

    const [deadText, exitStatusText] = line.split(/\s+/, 2);
    return {
      kind: "ok",
      dead: deadText === "1",
      exitStatus: exitStatusText === undefined ? null : Number(exitStatusText),
    };
  } catch (error) {
    if (isMissingTmuxTarget(error)) {
      return { kind: "missing" };
    }

    throw error;
  }
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

async function signalPane(session: ShellSession, signalName: NodeJS.Signals): Promise<void> {
  if (signalName === "SIGINT") {
    await runTmux(["send-keys", "-t", session.paneTarget, "C-c"]);
    return;
  }

  const foregroundProcessGroup = await getForegroundProcessGroup(session.panePid);
  if (foregroundProcessGroup !== null) {
    process.kill(-foregroundProcessGroup, signalName);
    return;
  }

  process.kill(session.panePid, signalName);
}

async function sendInput(paneTarget: string, input: string): Promise<void> {
  const parts = input.split(/(\r\n|\r|\n)/);

  for (const part of parts) {
    if (part === "") {
      continue;
    }

    if (part === "\r" || part === "\n" || part === "\r\n") {
      await runTmux(["send-keys", "-t", paneTarget, "Enter"]);
      continue;
    }

    await runTmux(["send-keys", "-t", paneTarget, "-l", part]);
  }
}

async function getForegroundProcessGroup(processId: number): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ps", ["-o", "tpgid=", "-p", String(processId)], {
      encoding: "utf8",
    });
    const tpgid = Number(stdout.trim());
    if (!Number.isFinite(tpgid) || tpgid <= 1) {
      return null;
    }

    return tpgid;
  } catch {
    return null;
  }
}

function isMissingTmuxTarget(error: unknown): boolean {
  return error instanceof Error && /can't find (pane|session)/.test(error.message);
}

function clampDimension(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(20, Math.min(400, Math.trunc(value)));
}
