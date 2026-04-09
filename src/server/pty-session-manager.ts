import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PTY_HELPER_PATH = path.join(PROJECT_ROOT, "scripts", "pty-session.py");
const SESSION_STATE_DIR =
  process.env.CSH_SESSION_STATE_DIR ??
  path.join(PROJECT_ROOT, ".csh-runtime", "sessions");
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
const OUTPUT_BYTE_LIMIT = parseOutputByteLimit(process.env.CSH_SCROLLBACK_LINES, 10_000);
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

type SessionRecord = {
  sessionId: string;
  ownerId: string;
  command: string;
  cwd?: string;
  cols: number;
  rows: number;
  createdAt: string;
  lastActivityAt: string;
};

type RuntimeRecord = {
  runtimePid: number | null;
  helperPid: number | null;
  revision: number;
  outputBaseOffset: number;
  startedAt?: string;
  closedAt?: string;
  exitStatus?: number | null;
};

type SessionState = {
  sessionRecord: SessionRecord;
  runtime: RuntimeRecord;
  output: Buffer;
  live: boolean;
  session: ShellSession;
};

export type ShellSession = {
  sessionId: string;
  ownerId: string;
  command: string;
  cwd?: string;
  cols: number;
  rows: number;
  revision: number;
  createdAt: string;
  lastActivityAt: string;
  closedAt?: string;
  exitStatus?: number | null;
  runtimePid?: number | null;
  outputBase64: string;
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
  snapshotBase64?: string;
  delta?: string;
  deltaBase64?: string;
};

type HelperResponse = {
  ok?: boolean;
  error?: string;
  runtimePid?: number | null;
  helperPid?: number | null;
  revision?: number;
  outputBaseOffset?: number;
  closedAt?: string | null;
  exitStatus?: number | null;
};

export class PtySessionManager {
  private readonly ready: Promise<void>;
  private readonly scavengeTimer?: NodeJS.Timeout;

  public constructor() {
    this.ready = initializeStateDir();

    if (SESSION_SCAVENGE_INTERVAL_MS > 0) {
      const timer = setInterval(() => {
        void this.scavengeSessions().catch(reportBackgroundError);
      }, SESSION_SCAVENGE_INTERVAL_MS);
      this.scavengeTimer = timer;
    }
  }

  public async shutdown(): Promise<void> {
    if (this.scavengeTimer) {
      clearInterval(this.scavengeTimer);
    }
    await this.ready;
  }

  public async openSession(input: OpenSessionInput): Promise<ShellSession> {
    await this.ready;

    const ownerId = input.ownerId ?? "local";
    const requestedSessionId = input.sessionId?.trim()
      ? requireSafeSessionId(input.sessionId.trim())
      : undefined;

    if (requestedSessionId) {
      const existing = await this.readState(requestedSessionId);
      if (existing) {
        if (existing.sessionRecord.ownerId !== ownerId) {
          throw new Error(`Session ${requestedSessionId} is owned by a different actor`);
        }

        if (existing.live && !existing.session.closedAt) {
          const refreshed = await this.touchSessionActivity(existing.sessionRecord);
          return cloneShellSession({
            ...existing.session,
            lastActivityAt: refreshed.lastActivityAt,
            outputBase64: "",
          });
        }

        await this.discardSession(existing.sessionRecord.sessionId);
      }
    }

    const sessionId = requestedSessionId ?? randomUUID();
    const cols = clampDimension(input.cols, 80);
    const rows = clampDimension(input.rows, 24);
    const command = input.command ?? `${process.env.SHELL ?? "/bin/bash"} -i`;
    const createdAt = new Date().toISOString();

    const sessionRecord: SessionRecord = {
      sessionId,
      ownerId,
      command,
      cwd: input.cwd,
      cols,
      rows,
      createdAt,
      lastActivityAt: createdAt,
    };

    await this.persistSessionRecord(sessionRecord);
    await this.persistRuntimeRecord(sessionId, {
      runtimePid: null,
      helperPid: null,
      revision: 0,
      outputBaseOffset: 0,
      exitStatus: null,
    });
    await this.persistOutput(sessionId, Buffer.alloc(0));
    await this.spawnHelper(sessionRecord);
    const state = await this.waitForHelperReady(sessionId);

    return cloneShellSession({
      ...state.session,
      revision: 0,
      outputBase64: "",
    });
  }

  public async getSession(sessionId: string): Promise<ShellSession> {
    await this.ready;
    requireSafeSessionId(sessionId);

    const state = await this.readState(sessionId);
    if (!state) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    return cloneShellSession(state.session);
  }

  public async writeToSession(
    sessionId: string,
    actorId: string,
    input?: string,
    inputBase64?: string,
  ): Promise<ShellSession> {
    const state = await this.getOpenStateForActor(sessionId, actorId);
    const dataBase64 =
      inputBase64 ?? Buffer.from(input ?? "", "utf8").toString("base64");

    await this.sendLiveCommand(sessionId, {
      type: "write",
      data: dataBase64,
    });

    const sessionRecord = await this.touchSessionActivity(state.sessionRecord);
    const refreshed = await this.requireState(sessionId);
    return cloneShellSession({
      ...refreshed.session,
      lastActivityAt: sessionRecord.lastActivityAt,
    });
  }

  public async resizeSession(
    sessionId: string,
    cols: number,
    rows: number,
    actorId: string,
  ): Promise<ShellSession> {
    const state = await this.getOpenStateForActor(sessionId, actorId);
    const nextRecord: SessionRecord = {
      ...state.sessionRecord,
      cols: clampDimension(cols, state.sessionRecord.cols),
      rows: clampDimension(rows, state.sessionRecord.rows),
      lastActivityAt: new Date().toISOString(),
    };

    await this.persistSessionRecord(nextRecord);
    try {
      await this.sendLiveCommand(sessionId, {
        type: "resize",
        cols: nextRecord.cols,
        rows: nextRecord.rows,
      });
    } catch (error) {
      await this.persistSessionRecord(state.sessionRecord);
      throw error;
    }

    const refreshed = await this.requireState(sessionId);
    return cloneShellSession(refreshed.session);
  }

  public async signalSession(
    sessionId: string,
    signalName: NodeJS.Signals,
    actorId: string,
  ): Promise<ShellSession> {
    const state = await this.getOpenStateForActor(sessionId, actorId);

    await this.sendLiveCommand(sessionId, {
      type: "signal",
      signal: signalName,
    });

    const sessionRecord = await this.touchSessionActivity(state.sessionRecord);
    const refreshed = await this.requireState(sessionId);
    return cloneShellSession({
      ...refreshed.session,
      lastActivityAt: sessionRecord.lastActivityAt,
    });
  }

  public async pollSession(
    sessionId: string,
    actorId: string,
    cursor?: number,
    keepAlive = false,
  ): Promise<PollResult> {
    await this.scavengeSessions();
    let state = await this.getStateForActor(sessionId, actorId);

    if (state.session.closedAt && this.shouldEvictClosedSession(state.session)) {
      await this.discardSession(sessionId);
      throw new Error(`Unknown session: ${sessionId}`);
    }

    if (!state.session.closedAt && this.isSessionIdle(state.session)) {
      try {
        await this.sendLiveCommand(sessionId, { type: "close" });
      } catch {
        await this.markRuntimeClosed(sessionId, state.runtime, null);
      }

      try {
        state = await this.waitForSessionClosed(sessionId, 3_000);
      } catch {
        state = await this.forceCloseSession(state);
      }
    }

    let session = state.session;

    if (keepAlive && !session.closedAt && shouldRefreshKeepAlive(session)) {
      const updated = await this.touchSessionActivity(state.sessionRecord);
      session = {
        ...session,
        lastActivityAt: updated.lastActivityAt,
      };
    }

    const requestedRevision = cursor ?? -1;
    const changed = requestedRevision !== session.revision;
    const snapshotBase64 = state.output.toString("base64");
    const deltaBase64 = collectOutputDelta(
      state.output,
      state.runtime.outputBaseOffset,
      cursor,
      session.revision,
    );
    const shouldSendSnapshot =
      changed &&
      (cursor === undefined || deltaBase64 === undefined || Boolean(session.closedAt));

    return {
      session: cloneShellSession(session),
      changed,
      revision: session.revision,
      snapshot: shouldSendSnapshot ? decodeUtf8(snapshotBase64) : undefined,
      snapshotBase64: shouldSendSnapshot ? snapshotBase64 : undefined,
      delta: !shouldSendSnapshot && deltaBase64 ? decodeUtf8(deltaBase64) : undefined,
      deltaBase64: !shouldSendSnapshot ? deltaBase64 : undefined,
    };
  }

  public async closeSession(sessionId: string, actorId: string): Promise<ShellSession> {
    const state = await this.getStateForActor(sessionId, actorId);
    if (state.session.closedAt) {
      return cloneShellSession(state.session);
    }

    try {
      await this.sendLiveCommand(sessionId, { type: "close" });
    } catch {
      await this.markRuntimeClosed(sessionId, state.runtime, null);
    }

    let closed: SessionState;
    try {
      closed = await this.waitForSessionClosed(sessionId);
    } catch {
      closed = await this.forceCloseSession(state);
    }
    return cloneShellSession(closed.session);
  }

  private async getStateForActor(sessionId: string, actorId: string): Promise<SessionState> {
    const state = await this.requireState(sessionId);
    if (state.session.ownerId !== actorId) {
      throw new Error(`Session ${sessionId} is owned by a different actor`);
    }

    return state;
  }

  private async getOpenStateForActor(sessionId: string, actorId: string): Promise<SessionState> {
    const state = await this.getStateForActor(sessionId, actorId);
    if (state.session.closedAt) {
      throw new Error(`Session ${sessionId} is already closed`);
    }

    return state;
  }

  private async requireState(sessionId: string): Promise<SessionState> {
    const state = await this.readState(sessionId);
    if (!state) {
      throw new Error(`Unknown session: ${sessionId}`);
    }

    return state;
  }

  private async readState(sessionId: string): Promise<SessionState | null> {
    const sessionRecord = await this.readSessionRecord(sessionId);
    if (!sessionRecord) {
      return null;
    }

    let runtime = await this.readRuntimeRecord(sessionId);
    const output = await this.readOutput(sessionId);
    const live = !runtime.closedAt && await this.canReachHelper(sessionId);

    if (!runtime.closedAt && !live && runtime.helperPid !== null && !isPidAlive(runtime.helperPid)) {
      runtime = await this.waitForHelperShutdown(sessionId, runtime);
    }

    return buildSessionState(sessionRecord, runtime, output, !runtime.closedAt && live);
  }

  private async readSessionRecord(sessionId: string): Promise<SessionRecord | null> {
    const filePath = this.sessionRecordPath(sessionId);
    return await readJsonFile<SessionRecord>(filePath, isSessionRecord);
  }

  private async readRuntimeRecord(sessionId: string): Promise<RuntimeRecord> {
    const runtime = await readJsonFile<RuntimeRecord>(
      this.runtimeRecordPath(sessionId),
      isRuntimeRecord,
    );
    if (runtime) {
      return runtime;
    }

    return {
      runtimePid: null,
      helperPid: null,
      revision: 0,
      outputBaseOffset: 0,
      exitStatus: null,
    };
  }

  private async readOutput(sessionId: string): Promise<Buffer> {
    try {
      return Buffer.from(await readFile(this.outputPath(sessionId)));
    } catch {
      return Buffer.alloc(0);
    }
  }

  private async persistSessionRecord(session: SessionRecord): Promise<void> {
    const dirPath = this.sessionDir(session.sessionId);
    await mkdir(dirPath, { recursive: true, mode: 0o700 });
    await chmod(dirPath, 0o700).catch(() => undefined);
    await writeJsonFile(this.sessionRecordPath(session.sessionId), session);
  }

  private async persistRuntimeRecord(sessionId: string, runtime: RuntimeRecord): Promise<void> {
    const dirPath = this.sessionDir(sessionId);
    await mkdir(dirPath, { recursive: true, mode: 0o700 });
    await chmod(dirPath, 0o700).catch(() => undefined);
    await writeJsonFile(this.runtimeRecordPath(sessionId), runtime);
  }

  private async persistOutput(sessionId: string, output: Buffer): Promise<void> {
    const dirPath = this.sessionDir(sessionId);
    await mkdir(dirPath, { recursive: true, mode: 0o700 });
    await chmod(dirPath, 0o700).catch(() => undefined);
    const filePath = this.outputPath(sessionId);
    const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, output);
    await chmod(tempPath, 0o600).catch(() => undefined);
    await rename(tempPath, filePath);
    await chmod(filePath, 0o600).catch(() => undefined);
  }

  private async touchSessionActivity(sessionRecord: SessionRecord): Promise<SessionRecord> {
    const updated: SessionRecord = {
      ...sessionRecord,
      lastActivityAt: new Date().toISOString(),
    };
    await this.persistSessionRecord(updated);
    return updated;
  }

  private async spawnHelper(sessionRecord: SessionRecord): Promise<void> {
    const child = spawn(
      "python3",
      [
        PTY_HELPER_PATH,
        "--session-dir",
        this.sessionDir(sessionRecord.sessionId),
        "--command",
        sessionRecord.command,
        "--cols",
        String(sessionRecord.cols),
        "--rows",
        String(sessionRecord.rows),
        "--output-byte-limit",
        String(OUTPUT_BYTE_LIMIT),
        ...(sessionRecord.cwd ? ["--cwd", sessionRecord.cwd] : []),
      ],
      {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: "ignore",
      },
    );

    child.unref();
  }

  private async waitForHelperReady(sessionId: string, timeoutMs = 5_000): Promise<SessionState> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const state = await this.readState(sessionId);
      if (
        state &&
        state.runtime.runtimePid !== null &&
        (state.live || Boolean(state.session.closedAt))
      ) {
        return state;
      }

      await sleep(50);
    }

    throw new Error(`Timed out waiting for PTY helper for session ${sessionId}`);
  }

  private async waitForSessionClosed(sessionId: string, timeoutMs = 5_000): Promise<SessionState> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const state = await this.requireState(sessionId);
      if (state.session.closedAt) {
        return state;
      }

      await sleep(50);
    }

    throw new Error(`Timed out waiting for session ${sessionId} to close`);
  }

  private async forceCloseSession(state: SessionState): Promise<SessionState> {
    await terminateProcessGroup(state.runtime.runtimePid, "SIGHUP");
    await sleep(200);
    if (state.runtime.runtimePid !== null && isPidAlive(state.runtime.runtimePid)) {
      await terminateProcessGroup(state.runtime.runtimePid, "SIGTERM");
      await sleep(500);
    }
    if (state.runtime.runtimePid !== null && isPidAlive(state.runtime.runtimePid)) {
      await terminateProcessGroup(state.runtime.runtimePid, "SIGKILL");
      await sleep(100);
    }

    await this.markRuntimeClosed(state.sessionRecord.sessionId, state.runtime, null);
    return await this.requireState(state.sessionRecord.sessionId);
  }

  private async waitForHelperShutdown(
    sessionId: string,
    runtime: RuntimeRecord,
    timeoutMs = 300,
  ): Promise<RuntimeRecord> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const refreshed = await this.readRuntimeRecord(sessionId);
      if (refreshed.closedAt) {
        return refreshed;
      }
      await sleep(25);
    }

    return await this.markRuntimeClosed(sessionId, runtime, null);
  }

  private async canReachHelper(sessionId: string): Promise<boolean> {
    const runtime = await this.readRuntimeRecord(sessionId);
    if (runtime.closedAt || runtime.helperPid === null) {
      return false;
    }

    if (!(await pathExists(this.controlPath(sessionId)))) {
      return false;
    }

    return isPidAlive(runtime.helperPid);
  }

  private async sendLiveCommand(
    sessionId: string,
    command: Record<string, unknown>,
  ): Promise<HelperResponse> {
    const requestId = randomUUID();
    const controlPath = this.controlPath(sessionId);
    const replyPath = this.replyPath(sessionId, requestId);

    try {
      await rm(replyPath, { force: true });
      await writeFile(
        controlPath,
        `${JSON.stringify({ requestId, ...command })}\n`,
        "utf8",
      );
      return await waitForReply(replyPath, 1_500);
    } catch (error) {
      const state = await this.readState(sessionId);
      if (state && !state.runtime.closedAt) {
        await this.markRuntimeClosed(sessionId, state.runtime, null);
      }
      throw error;
    }
  }

  private async markRuntimeClosed(
    sessionId: string,
    runtime: RuntimeRecord,
    exitStatus: number | null,
  ): Promise<RuntimeRecord> {
    const nextRuntime: RuntimeRecord = {
      ...runtime,
      closedAt: runtime.closedAt ?? new Date().toISOString(),
      exitStatus: runtime.exitStatus ?? exitStatus,
    };
    await this.persistRuntimeRecord(sessionId, nextRuntime);
    return nextRuntime;
  }

  private async scavengeSessions(): Promise<void> {
    await this.ready;
    const entries = await readdir(SESSION_STATE_DIR, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const sessionId = entry.name;
      if (!SAFE_SESSION_ID_RE.test(sessionId)) {
        continue;
      }

      const state = await this.readState(sessionId);
      if (!state) {
        continue;
      }

      if (state.session.closedAt) {
        if (this.shouldEvictClosedSession(state.session)) {
          await this.discardSession(sessionId);
        }
        continue;
      }

      if (!this.isSessionIdle(state.session)) {
        continue;
      }

      try {
        await this.sendLiveCommand(sessionId, { type: "close" });
      } catch {
        await this.markRuntimeClosed(sessionId, state.runtime, null);
      }
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
    if (!session.closedAt || CLOSED_SESSION_TTL_MS <= 0) {
      return false;
    }

    const closedAtMs = safeDateMs(session.closedAt);
    if (closedAtMs === null) {
      return false;
    }

    return Date.now() - closedAtMs > CLOSED_SESSION_TTL_MS;
  }

  private async discardSession(sessionId: string): Promise<void> {
    await rm(this.sessionDir(sessionId), { recursive: true, force: true });
  }

  private sessionDir(sessionId: string): string {
    return path.join(SESSION_STATE_DIR, sessionId);
  }

  private sessionRecordPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "session.json");
  }

  private runtimeRecordPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "runtime.json");
  }

  private outputPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "output.bin");
  }

  private controlPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), "control.fifo");
  }

  private replyPath(sessionId: string, requestId: string): string {
    return path.join(this.sessionDir(sessionId), "replies", `${requestId}.json`);
  }
}

async function initializeStateDir(): Promise<void> {
  await mkdir(SESSION_STATE_DIR, { recursive: true, mode: 0o700 });
  await chmod(SESSION_STATE_DIR, 0o700).catch(() => undefined);
}

async function waitForReply(replyPath: string, timeoutMs: number): Promise<HelperResponse> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const parsed = await readJsonFile<HelperResponse>(replyPath, isHelperResponse);
    if (parsed) {
      await rm(replyPath, { force: true }).catch(() => undefined);
      if (typeof parsed.error === "string" && parsed.error.length > 0) {
        throw new Error(parsed.error);
      }
      return parsed;
    }

    await sleep(20);
  }

  throw new Error(`Timed out waiting for PTY helper reply: ${replyPath}`);
}

function buildSessionState(
  sessionRecord: SessionRecord,
  runtime: RuntimeRecord,
  output: Buffer,
  live: boolean,
): SessionState {
  const computedRevision = Math.max(runtime.revision, runtime.outputBaseOffset + output.length);
  const session: ShellSession = {
    sessionId: sessionRecord.sessionId,
    ownerId: sessionRecord.ownerId,
    command: sessionRecord.command,
    ...(sessionRecord.cwd ? { cwd: sessionRecord.cwd } : {}),
    cols: sessionRecord.cols,
    rows: sessionRecord.rows,
    revision: computedRevision,
    createdAt: sessionRecord.createdAt,
    lastActivityAt: sessionRecord.lastActivityAt,
    ...(runtime.closedAt ? { closedAt: runtime.closedAt } : {}),
    exitStatus: runtime.exitStatus ?? null,
    runtimePid: runtime.runtimePid,
    outputBase64: output.toString("base64"),
  };

  return {
    sessionRecord,
    runtime: {
      ...runtime,
      revision: computedRevision,
    },
    output,
    live,
    session,
  };
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await chmod(tempPath, 0o600).catch(() => undefined);
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600).catch(() => undefined);
}

async function readJsonFile<T>(
  filePath: string,
  predicate: (value: unknown) => value is T,
): Promise<T | null> {
  try {
    const text = await readFile(filePath, "utf8");
    const parsed = JSON.parse(text);
    return predicate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectOutputDelta(
  output: Buffer,
  outputBaseOffset: number,
  cursor: number | undefined,
  currentRevision: number,
): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }

  if (cursor >= currentRevision) {
    return undefined;
  }

  if (cursor < outputBaseOffset) {
    return undefined;
  }

  const start = cursor - outputBaseOffset;
  if (start < 0 || start > output.length) {
    return undefined;
  }

  return output.subarray(start).toString("base64");
}

function cloneShellSession(session: ShellSession): ShellSession {
  return {
    ...session,
    outputBase64: session.outputBase64,
  };
}

function decodeUtf8(dataBase64: string): string {
  return Buffer.from(dataBase64, "base64").toString("utf8");
}

function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    SAFE_SESSION_ID_RE.test(value.sessionId) &&
    "ownerId" in value &&
    typeof value.ownerId === "string" &&
    "command" in value &&
    typeof value.command === "string" &&
    "cols" in value &&
    typeof value.cols === "number" &&
    "rows" in value &&
    typeof value.rows === "number" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "lastActivityAt" in value &&
    typeof value.lastActivityAt === "string"
  );
}

function isRuntimeRecord(value: unknown): value is RuntimeRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "runtimePid" in value &&
    (typeof value.runtimePid === "number" || value.runtimePid === null) &&
    "helperPid" in value &&
    (typeof value.helperPid === "number" || value.helperPid === null) &&
    "revision" in value &&
    typeof value.revision === "number" &&
    "outputBaseOffset" in value &&
    typeof value.outputBaseOffset === "number"
  );
}

function isHelperResponse(value: unknown): value is HelperResponse {
  return typeof value === "object" && value !== null;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await stat(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function terminateProcessGroup(
  pid: number | null,
  signalName: NodeJS.Signals,
): Promise<void> {
  if (pid === null) {
    return;
  }

  try {
    process.kill(-pid, signalName);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") {
      throw error;
    }
  }
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

function parseOutputByteLimit(value: string | undefined, fallbackLines: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  const lines = Number.isFinite(parsed) ? parsed : fallbackLines;
  return Math.max(256_000, Math.min(10_000_000, lines * 256));
}

function clampDimension(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.max(20, Math.min(400, Math.trunc(value)));
}

function shouldRefreshKeepAlive(session: ShellSession): boolean {
  const lastActivityMs = safeDateMs(session.lastActivityAt);
  if (lastActivityMs === null) {
    return true;
  }

  return Date.now() - lastActivityMs >= KEEPALIVE_THROTTLE_MS;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function reportBackgroundError(error: unknown): void {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
}
