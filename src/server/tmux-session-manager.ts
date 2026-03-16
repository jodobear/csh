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
const TMUX_SCROLLBACK_LINES = parseScrollbackLines(process.env.CSH_SCROLLBACK_LINES, 10_000);
const TMUX_HISTORY_START = `-${TMUX_SCROLLBACK_LINES}`;
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
const KEEPALIVE_THROTTLE_MS = Math.max(
  1_000,
  Math.min(
    15_000,
    SESSION_IDLE_TTL_MS > 0 ? Math.max(1_000, Math.trunc(SESSION_IDLE_TTL_MS / 2)) : 15_000,
  ),
);
const SESSION_SCAVENGE_INTERVAL_MS = parseDurationMs(
  process.env.CSH_SESSION_SCAVENGE_INTERVAL_SECONDS,
  60 * 1000,
);
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

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
    const requestedSessionId = input.sessionId?.trim()
      ? requireSafeSessionId(input.sessionId.trim())
      : undefined;
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
    requireSafeSessionId(sessionId);

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

  public async pollSession(
    sessionId: string,
    actorId: string,
    cursor?: number,
    keepAlive = false,
  ): Promise<PollResult> {
    const session = await this.getSessionForActor(sessionId, actorId);
    let dirty = await this.refreshSessionState(session);

    const snapshot = session.closedAt ? session.lastSnapshot : await capturePane(session.paneTarget);

    if (snapshot !== session.lastSnapshot) {
      session.revision += 1;
      session.lastSnapshot = snapshot;
      dirty = true;
    }

    if (keepAlive && !session.closedAt && shouldRefreshKeepAlive(session)) {
      session.lastActivityAt = new Date().toISOString();
      dirty = true;
    }

    if (dirty) {
      await this.persistSession(session);
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

  private async refreshSessionState(session: ShellSession): Promise<boolean> {
    if (session.closedAt) {
      return false;
    }

    const paneState = await getPaneState(session.paneTarget);
    if (paneState.kind === "missing") {
      session.closedAt = new Date().toISOString();
      session.exitStatus ??= null;
      await this.persistSession(session);
      return true;
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
      return true;
    }

    return false;
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
  let literalBuffer = "";

  for (const action of parseTerminalInput(input)) {
    if (action.kind === "literal") {
      literalBuffer += action.value;
      continue;
    }

    if (literalBuffer.length > 0) {
      await runTmux(["send-keys", "-t", paneTarget, "-l", literalBuffer]);
      literalBuffer = "";
    }

    await runTmux(["send-keys", "-t", paneTarget, action.key]);
  }

  if (literalBuffer.length > 0) {
    await runTmux(["send-keys", "-t", paneTarget, "-l", literalBuffer]);
  }
}

type InputAction =
  | { kind: "literal"; value: string }
  | { kind: "key"; key: string };

function parseTerminalInput(input: string): InputAction[] {
  const actions: InputAction[] = [];
  let index = 0;

  while (index < input.length) {
    const bracketedPasteStart = input.startsWith("\u001b[200~", index);
    if (bracketedPasteStart) {
      const pasteEnd = input.indexOf("\u001b[201~", index + 6);
      if (pasteEnd !== -1) {
        const pasted = input.slice(index + 6, pasteEnd);
        if (pasted.length > 0) {
          actions.push({ kind: "literal", value: pasted });
        }
        index = pasteEnd + 6;
        continue;
      }
    }

    const special = parseSpecialSequence(input, index);
    if (special) {
      actions.push(special.action);
      index += special.length;
      continue;
    }

    actions.push({ kind: "literal", value: input[index] });
    index += 1;
  }

  return coalesceLiteralActions(actions);
}

function parseSpecialSequence(
  input: string,
  index: number,
): { action: InputAction; length: number } | null {
  if (input.startsWith("\r\n", index)) {
    return { action: { kind: "key", key: "Enter" }, length: 2 };
  }

  const char = input[index];
  if (char === "\r" || char === "\n") {
    return { action: { kind: "key", key: "Enter" }, length: 1 };
  }
  if (char === "\t") {
    return { action: { kind: "key", key: "Tab" }, length: 1 };
  }
  if (char === "\u007f" || char === "\b") {
    return { action: { kind: "key", key: "BSpace" }, length: 1 };
  }

  const code = char.charCodeAt(0);
  if (code >= 0x01 && code <= 0x1a) {
    const key = String.fromCharCode(code + 96);
    return { action: { kind: "key", key: `C-${key}` }, length: 1 };
  }

  if (char !== "\u001b") {
    return null;
  }

  for (const [sequence, key] of ESCAPE_KEY_SEQUENCES) {
    if (input.startsWith(sequence, index)) {
      return { action: { kind: "key", key }, length: sequence.length };
    }
  }

  const modifiedArrow = input.slice(index).match(/^\u001b\[1;([235])([ABCDHF])/) ??
    input.slice(index).match(/^\u001b\[([1-8]);([235])([ABCDHF])/);
  if (modifiedArrow) {
    const modifier = modifiedArrow[1] ?? modifiedArrow[2];
    const keyCode = modifiedArrow[2] ?? modifiedArrow[3];
    const prefix = modifierToTmuxPrefix(modifier);
    const key = navigationKeyName(keyCode);
    if (prefix && key) {
      return { action: { kind: "key", key: `${prefix}-${key}` }, length: modifiedArrow[0].length };
    }
  }

  const altChar = input[index + 1];
  if (altChar && altChar !== "\u001b" && !altChar.startsWith?.("[")) {
    const maybeAlt = altKeyName(altChar);
    if (maybeAlt) {
      return { action: { kind: "key", key: maybeAlt }, length: 2 };
    }
  }

  return { action: { kind: "key", key: "Escape" }, length: 1 };
}

const ESCAPE_KEY_SEQUENCES = new Map<string, string>([
  ["\u001b[A", "Up"],
  ["\u001b[B", "Down"],
  ["\u001b[C", "Right"],
  ["\u001b[D", "Left"],
  ["\u001bOA", "Up"],
  ["\u001bOB", "Down"],
  ["\u001bOC", "Right"],
  ["\u001bOD", "Left"],
  ["\u001b[H", "Home"],
  ["\u001b[F", "End"],
  ["\u001bOH", "Home"],
  ["\u001bOF", "End"],
  ["\u001b[3~", "DC"],
  ["\u001b[5~", "PageUp"],
  ["\u001b[6~", "PageDown"],
  ["\u001b[Z", "BTab"],
]);

function navigationKeyName(code: string | undefined): string | null {
  switch (code) {
    case "A":
      return "Up";
    case "B":
      return "Down";
    case "C":
      return "Right";
    case "D":
      return "Left";
    case "H":
      return "Home";
    case "F":
      return "End";
    default:
      return null;
  }
}

function modifierToTmuxPrefix(modifier: string | undefined): string | null {
  switch (modifier) {
    case "2":
      return "S";
    case "3":
      return "M";
    case "5":
      return "C";
    default:
      return null;
  }
}

function altKeyName(char: string): string | null {
  if (/^[A-Za-z0-9]$/.test(char)) {
    return `M-${char.toLowerCase()}`;
  }
  return null;
}

function coalesceLiteralActions(actions: InputAction[]): InputAction[] {
  const merged: InputAction[] = [];

  for (const action of actions) {
    const previous = merged[merged.length - 1];
    if (action.kind === "literal" && previous?.kind === "literal") {
      previous.value += action.value;
      continue;
    }

    merged.push(action);
  }

  return merged;
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
    SAFE_SESSION_ID_RE.test(value.sessionId) &&
    "tmuxSessionName" in value &&
    typeof value.tmuxSessionName === "string" &&
    "ownerId" in value &&
    typeof value.ownerId === "string"
  );
}

function requireSafeSessionId(sessionId: string): string {
  if (!SAFE_SESSION_ID_RE.test(sessionId)) {
    throw new Error(
      "sessionId must start with an alphanumeric character and contain only letters, digits, '_' or '-'",
    );
  }

  return sessionId;
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

function parseScrollbackLines(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1000, Math.min(200_000, parsed));
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
  return `csh-${requireSafeSessionId(sessionId)}`;
}

function shouldRefreshKeepAlive(session: ShellSession): boolean {
  const lastActivityMs = safeDateMs(session.lastActivityAt);
  if (lastActivityMs === null) {
    return true;
  }

  return Date.now() - lastActivityMs >= KEEPALIVE_THROTTLE_MS;
}
