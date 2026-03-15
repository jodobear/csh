import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TMUX_HISTORY_START = "-2000";
const TMUX_SOCKET_PATH =
  process.env.CSH_TMUX_SOCKET ??
  path.join(process.cwd(), ".csh-runtime", "tmux.sock");
const SESSION_STATE_DIR =
  process.env.CSH_SESSION_STATE_DIR ??
  path.join(path.dirname(TMUX_SOCKET_PATH), "sessions");
const SESSION_IDLE_TTL_MS = parseDurationMs(
  process.env.CSH_SESSION_IDLE_TTL_SECONDS,
  30 * 60 * 1000,
);
const CLOSED_SESSION_TTL_MS = parseDurationMs(
  process.env.CSH_CLOSED_SESSION_TTL_SECONDS,
  5 * 60 * 1000,
);
const SESSION_SCAVENGE_INTERVAL_MS = parseDurationMs(
  process.env.CSH_SESSION_SCAVENGE_INTERVAL_SECONDS,
  60 * 1000,
);

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
  sessionId?: string;
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
  private readonly ready: Promise<void>;

  public constructor() {
    this.ready = this.loadPersistedSessions();

    if (SESSION_SCAVENGE_INTERVAL_MS > 0) {
      const timer = setInterval(() => {
        void this.scavengeSessions().catch(reportBackgroundError);
      }, SESSION_SCAVENGE_INTERVAL_MS);
      timer.unref?.();
    }
  }

  public async openSession(input: OpenSessionInput): Promise<ShellSession> {
    await this.ready;

    const ownerId = input.ownerId ?? "local";
    const requestedSessionId = input.sessionId?.trim() || undefined;
    if (requestedSessionId) {
      const existing = this.sessions.get(requestedSessionId);
      if (existing) {
        if (existing.ownerId !== ownerId) {
          throw new Error(`Session ${requestedSessionId} is owned by a different actor`);
        }

        await this.refreshSessionState(existing);
        if (!existing.closedAt) {
          existing.lastActivityAt = new Date().toISOString();
          await this.persistSession(existing);
          return existing;
        }

        await this.discardClosedSession(existing);
      }
    }

    const sessionId = requestedSessionId ?? randomUUID();
    const tmuxSessionName = tmuxSessionNameFor(sessionId);
    const cols = clampDimension(input.cols, 80);
    const rows = clampDimension(input.rows, 24);
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
    await this.persistSession(session);
    return session;
  }

  public async getSession(sessionId: string): Promise<ShellSession> {
    await this.ready;

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
    await this.persistSession(session);
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

    await this.persistSession(session);
    return session;
  }

  public async signalSession(
    sessionId: string,
    signalName: NodeJS.Signals,
    actorId: string,
  ): Promise<ShellSession> {
    const session = await this.getOpenSessionForActor(sessionId, actorId);
    await signalPane(session, signalName);
    session.lastActivityAt = new Date().toISOString();
    await this.persistSession(session);
    return session;
  }

  public async pollSession(sessionId: string, actorId: string, cursor?: number): Promise<PollResult> {
    const session = await this.getSessionForActor(sessionId, actorId);
    await this.refreshSessionState(session);

    const snapshot = session.closedAt ? session.lastSnapshot : await capturePane(session.paneTarget);

    if (snapshot !== session.lastSnapshot) {
      session.revision += 1;
      session.lastSnapshot = snapshot;
    }

    await this.persistSession(session);

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
    const session = await this.getSessionForActor(sessionId, actorId);

    if (!session.closedAt) {
      try {
        await runTmux(["kill-session", "-t", session.tmuxSessionName]);
      } catch (error) {
        if (!isMissingTmuxTarget(error)) {
          throw error;
        }
      }

      session.closedAt = new Date().toISOString();
      session.lastActivityAt = session.closedAt;
    }

    await this.persistSession(session);
    return session;
  }

  private async getSessionForActor(sessionId: string, actorId: string): Promise<ShellSession> {
    const session = await this.getSession(sessionId);
    if (session.ownerId !== actorId) {
      throw new Error(`Session ${sessionId} is owned by a different actor`);
    }

    return session;
  }

  private async getOpenSessionForActor(sessionId: string, actorId: string): Promise<ShellSession> {
    const session = await this.getSessionForActor(sessionId, actorId);
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
      await this.persistSession(session);
      return;
    }

    if (paneState.dead) {
      const finalSnapshot = await capturePane(session.paneTarget).catch((error) => {
        if (isMissingTmuxTarget(error)) {
          return session.lastSnapshot;
        }
        throw error;
      });
      if (finalSnapshot !== session.lastSnapshot) {
        session.revision += 1;
        session.lastSnapshot = finalSnapshot;
      }
      session.closedAt = session.closedAt ?? new Date().toISOString();
      session.exitStatus = paneState.exitStatus;
      await this.persistSession(session);
    }
  }

  private async loadPersistedSessions(): Promise<void> {
    await mkdir(SESSION_STATE_DIR, { recursive: true });
    const entries = await readdir(SESSION_STATE_DIR, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }

      const session = await this.readPersistedSession(path.join(SESSION_STATE_DIR, entry.name));
      if (!session) {
        continue;
      }

      if (session.closedAt) {
        if (this.shouldEvictClosedSession(session)) {
          await this.deletePersistedSession(session.sessionId);
          continue;
        }

        this.sessions.set(session.sessionId, session);
        continue;
      }

      try {
        const paneInfo = await getPaneInfo(session.tmuxSessionName);
        session.paneTarget = paneInfo.target;
        session.paneTty = paneInfo.tty;
        session.panePid = paneInfo.pid;
      } catch (error) {
        if (!isMissingTmuxTarget(error)) {
          throw error;
        }

        session.closedAt = new Date().toISOString();
        session.exitStatus ??= null;
      }

      this.sessions.set(session.sessionId, session);
      await this.persistSession(session);
    }
  }

  private async scavengeSessions(): Promise<void> {
    await this.ready;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.closedAt) {
        if (this.shouldEvictClosedSession(session)) {
          this.sessions.delete(sessionId);
          await this.deletePersistedSession(sessionId);
        }
        continue;
      }

      if (!this.isSessionIdle(session)) {
        continue;
      }

      try {
        await runTmux(["kill-session", "-t", session.tmuxSessionName]);
      } catch (error) {
        if (!isMissingTmuxTarget(error)) {
          throw error;
        }
      }

      session.closedAt = new Date().toISOString();
      session.lastActivityAt = session.closedAt;
      session.exitStatus ??= null;
      await this.persistSession(session);
    }
  }

  private isSessionIdle(session: ShellSession): boolean {
    if (SESSION_IDLE_TTL_MS <= 0) {
      return false;
    }

    const lastActivityMs = safeDateMs(session.lastActivityAt);
    if (lastActivityMs === null) {
      return false;
    }

    return Date.now() - lastActivityMs > SESSION_IDLE_TTL_MS;
  }

  private shouldEvictClosedSession(session: ShellSession): boolean {
    if (!session.closedAt) {
      return false;
    }
    if (CLOSED_SESSION_TTL_MS <= 0) {
      return false;
    }

    const closedAtMs = safeDateMs(session.closedAt);
    if (closedAtMs === null) {
      return false;
    }

    return Date.now() - closedAtMs > CLOSED_SESSION_TTL_MS;
  }

  private async persistSession(session: ShellSession): Promise<void> {
    await mkdir(SESSION_STATE_DIR, { recursive: true, mode: 0o700 });
    await chmod(SESSION_STATE_DIR, 0o700).catch(() => undefined);
    const outputPath = this.sessionStatePath(session.sessionId);
    await writeFile(outputPath, JSON.stringify(session, null, 2), "utf8");
    await chmod(outputPath, 0o600).catch(() => undefined);
  }

  private async deletePersistedSession(sessionId: string): Promise<void> {
    await rm(this.sessionStatePath(sessionId), { force: true });
  }

  private async discardClosedSession(session: ShellSession): Promise<void> {
    try {
      await runTmux(["kill-session", "-t", session.tmuxSessionName]);
    } catch (error) {
      if (!isMissingTmuxTarget(error)) {
        throw error;
      }
    }

    this.sessions.delete(session.sessionId);
    await this.deletePersistedSession(session.sessionId);
  }

  private async readPersistedSession(filePath: string): Promise<ShellSession | null> {
    try {
      const text = await readFile(filePath, "utf8");
      const parsed = JSON.parse(text);
      if (!isPersistedSession(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private sessionStatePath(sessionId: string): string {
    return path.join(SESSION_STATE_DIR, `${sessionId}.json`);
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

function isPersistedSession(value: unknown): value is ShellSession {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "tmuxSessionName" in value &&
    typeof value.tmuxSessionName === "string" &&
    "ownerId" in value &&
    typeof value.ownerId === "string"
  );
}

function safeDateMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationMs(value: string | undefined, fallbackMs: number): number {
  if (!value) {
    return fallbackMs;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }

  return Math.max(0, parsed * 1000);
}

function reportBackgroundError(error: unknown): void {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
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

function tmuxSessionNameFor(sessionId: string): string {
  const safeId = sessionId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `csh-${safeId}`;
}
