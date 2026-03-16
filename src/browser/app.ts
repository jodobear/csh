import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./app.css";

type OpenResult = {
  sessionId: string;
  cursor: number;
  cols: number;
  rows: number;
  ownerId: string;
  command: string;
};

type PollResult = {
  sessionId: string;
  changed: boolean;
  cursor: number;
  snapshot: string | null;
  cols: number;
  rows: number;
  closedAt: string | null;
  exitStatus: number | null;
};

type UiElements = {
  terminalContainer: HTMLElement;
  statusText: HTMLElement;
  sessionText: HTMLElement;
  reconnectButton: HTMLButtonElement;
  interruptButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

type BrowserRuntimeConfig = {
  apiToken: string;
  stateNamespace: string;
  scrollbackLines: number;
};

const pollIntervalMs = 60;
const browserConfig = readBrowserRuntimeConfig();
const storedSessionKey = `csh.browser.sessionId.${browserConfig.stateNamespace}`;

const ui = getUiElements();
const terminal = new Terminal({
  cursorBlink: true,
  convertEol: true,
  scrollback: browserConfig.scrollbackLines,
  fontFamily: '"IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", monospace',
  fontSize: 14,
  theme: {
    background: "#0f0d0a",
    foreground: "#efe4ca",
    cursor: "#ef9f43",
    cursorAccent: "#0f0d0a",
    selectionBackground: "rgba(239, 159, 67, 0.22)",
  },
});
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(ui.terminalContainer);
const keyboardCapture = createKeyboardCapture(ui.terminalContainer);
ui.terminalContainer.tabIndex = 0;
fitAddon.fit();
ui.terminalContainer.addEventListener("click", () => {
  focusKeyboardCapture();
});
window.addEventListener("focus", () => {
  focusKeyboardCapture();
});

let sessionId: string | null = readStoredSessionId();
let cursor: number | null = null;
let lastSnapshot = "";
let closed = false;
let stopping = false;
let pollTimer: number | null = null;
let rpcChain = Promise.resolve();
let reconnectFallbackMessage: string | null = null;

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  if (!sessionId || stopping) {
    return;
  }

  void queueRpc(async () => {
      await postJson("session/resize", {
        sessionId,
        ...getTerminalSize(),
      });
  }).catch(reportError);
});

resizeObserver.observe(ui.terminalContainer);

keyboardCapture.addEventListener("keydown", handleKeyboardCaptureKeydown);
keyboardCapture.addEventListener("input", handleKeyboardCaptureInput);
keyboardCapture.addEventListener("paste", handleKeyboardCapturePaste);

ui.reconnectButton.addEventListener("click", () => {
  void reconnectOrOpenSession().catch(reportError);
});

ui.interruptButton.addEventListener("click", () => {
  void interruptRemote().catch(reportError);
});

ui.closeButton.addEventListener("click", () => {
  void closeSession("Session closed from browser").catch(reportError);
});

await reconnectOrOpenSession();

async function reconnectOrOpenSession(): Promise<void> {
  cancelPollLoop();
  stopping = false;
  closed = false;
  lastSnapshot = "";
  cursor = null;
  terminal.reset();
  fitAddon.fit();
  focusKeyboardCapture();
  setControlsDisabled(true);

  if (sessionId) {
    setStatus("Reattaching to existing session...");
    setSessionLabel(sessionId);
    try {
      await queueRpc(() =>
        postJson("session/resize", {
          sessionId,
          ...getTerminalSize(),
        }),
      );
      setStatus("Reattached to existing session");
      setControlsDisabled(false);
      schedulePoll();
      return;
    } catch (error) {
      console.warn("Reattach failed, opening a fresh session", error);
      reconnectFallbackMessage = `Opened a new session because ${sessionId} could not be reattached`;
      sessionId = null;
      clearStoredSessionId();
    }
  }

  setStatus("Connecting to shell bridge...");
  setSessionLabel("opening");

  const result = await queueRpc(() =>
    postJson<OpenResult>("session/open", {
      ...getTerminalSize(),
    }),
  );

  sessionId = result.sessionId;
  cursor = null;
  writeStoredSessionId(result.sessionId);
  setStatus(reconnectFallbackMessage ?? `Connected to ${result.command}`);
  reconnectFallbackMessage = null;
  setSessionLabel(result.sessionId);
  setControlsDisabled(false);
  focusKeyboardCapture();
  schedulePoll();
}

async function interruptRemote(): Promise<void> {
  if (!sessionId || stopping) {
    return;
  }

  await queueRpc(() =>
    postJson("session/signal", {
      sessionId,
      signal: "SIGINT",
    }),
  );
  setStatus("Sent SIGINT to remote session");
}

async function sendInput(input: string): Promise<void> {
  if (!sessionId || stopping) {
    return;
  }

  await queueRpc(() =>
    postJson("session/write", {
      sessionId,
      input,
    }),
  );
}

async function closeSession(statusMessage: string): Promise<void> {
  if (!sessionId || stopping) {
    return;
  }

  stopping = true;
  cancelPollLoop();

  const activeSessionId = sessionId;

  try {
    await queueRpc(() =>
      postJson("session/close", {
        sessionId: activeSessionId,
      }),
    );
    sessionId = null;
    clearStoredSessionId();
    closed = true;
    setStatus(statusMessage);
    setSessionLabel("closed");
    setControlsDisabled(false, true);
  } catch (error) {
    setStatus(
      `Close failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    setControlsDisabled(false);
    schedulePoll();
    throw error;
  } finally {
    stopping = false;
  }
}

function schedulePoll(): void {
  cancelPollLoop();
  pollTimer = window.setTimeout(() => {
    void pollRemote().catch(reportError);
  }, pollIntervalMs);
}

function cancelPollLoop(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function pollRemote(): Promise<void> {
  if (!sessionId || stopping) {
    return;
  }

  const activeSessionId = sessionId;
  const result = await queueRpc(() =>
    postJson<PollResult>("session/poll", {
      sessionId: activeSessionId,
      keepAlive: document.visibilityState === "visible",
      ...(cursor === null ? {} : { cursor }),
    }),
  );

  cursor = result.cursor;

  if (result.snapshot !== null && result.snapshot !== lastSnapshot) {
    renderSnapshot(result.snapshot);
  }

  if (result.closedAt) {
    closed = true;
    sessionId = null;
    clearStoredSessionId();
    setStatus(
      `Remote session closed${result.exitStatus !== null ? ` with status ${result.exitStatus}` : ""}`,
    );
    setSessionLabel("closed");
    setControlsDisabled(false, true);
    return;
  }

  schedulePoll();
}

function renderSnapshot(snapshot: string): void {
  const normalized = normalizeSnapshot(snapshot);
  if (lastSnapshot && snapshot.startsWith(lastSnapshot)) {
    terminal.write(normalized.slice(normalizeSnapshot(lastSnapshot).length));
  } else {
    terminal.write("\x1b[H\x1b[2J");
    terminal.write(normalized);
  }
  lastSnapshot = snapshot;
}

function normalizeSnapshot(snapshot: string): string {
  const trimmed = snapshot.replace(/(?:\r?\n)+$/u, "\n");
  return trimmed.length > 0 ? trimmed : snapshot;
}

function getTerminalSize(): { cols: number; rows: number } {
  const cols = Math.max(20, Math.min(400, terminal.cols || 80));
  const rows = Math.max(20, Math.min(400, terminal.rows || 24));
  return { cols, rows };
}

function setStatus(message: string): void {
  ui.statusText.textContent = message;
}

function setSessionLabel(value: string): void {
  ui.sessionText.textContent = value;
}

function setControlsDisabled(disabled: boolean, closedState = false): void {
  ui.interruptButton.disabled = disabled || closedState || !sessionId;
  ui.closeButton.disabled = disabled || closedState || !sessionId;
  ui.reconnectButton.disabled = disabled || (!closed && Boolean(sessionId));
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (sessionId) {
    closed = true;
  }
  setStatus(`Error: ${message}`);
  setControlsDisabled(false, true);
  console.error(error);
}

function queueRpc<T>(operation: () => Promise<T>): Promise<T> {
  const next = rpcChain.then(operation, operation);
  rpcChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function postJson<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csh-browser-token": browserConfig.apiToken,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" && payload !== null && "error" in payload
        ? String(payload.error)
        : `Request failed with status ${response.status}`,
    );
  }

  return payload as T;
}

function toTerminalInput(event: KeyboardEvent): string | null {
  if (event.metaKey) {
    return null;
  }

  switch (event.key) {
    case "Enter":
      return "\n";
    case "Tab":
      return "\t";
    case "Backspace":
      return "\u007f";
    case "ArrowUp":
      return "\u001b[A";
    case "ArrowDown":
      return "\u001b[B";
    case "ArrowRight":
      return "\u001b[C";
    case "ArrowLeft":
      return "\u001b[D";
    case "Home":
      return "\u001b[H";
    case "End":
      return "\u001b[F";
    case "Delete":
      return "\u001b[3~";
    case "PageUp":
      return "\u001b[5~";
    case "PageDown":
      return "\u001b[6~";
    case "Escape":
      return "\u001b";
    default:
      break;
  }

  if (event.ctrlKey) {
    const code = event.key.toUpperCase().charCodeAt(0);
    if (code >= 65 && code <= 90) {
      return String.fromCharCode(code - 64);
    }

    return null;
  }

  if (event.altKey && event.key.length === 1) {
    return `\u001b${event.key}`;
  }

  if (event.key.length === 1) {
    return event.key;
  }

  return null;
}

function getUiElements(): UiElements {
  const terminalContainer = document.querySelector<HTMLElement>("[data-terminal]");
  const statusText = document.querySelector<HTMLElement>("[data-status]");
  const sessionText = document.querySelector<HTMLElement>("[data-session]");
  const reconnectButton = document.querySelector<HTMLButtonElement>("[data-action='reconnect']");
  const interruptButton = document.querySelector<HTMLButtonElement>("[data-action='interrupt']");
  const closeButton = document.querySelector<HTMLButtonElement>("[data-action='close']");

  if (
    !terminalContainer ||
    !statusText ||
    !sessionText ||
    !reconnectButton ||
    !interruptButton ||
    !closeButton
  ) {
    throw new Error("Browser terminal UI is missing required DOM elements");
  }

  return {
    terminalContainer,
    statusText,
    sessionText,
    reconnectButton,
    interruptButton,
    closeButton,
  };
}

function handleKeyboardCaptureKeydown(event: KeyboardEvent): void {
  if (!sessionId || stopping) {
    return;
  }

  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    void interruptRemote().catch(reportError);
    return;
  }

  const input = toTerminalInput(event);
  if (input === null) {
    return;
  }

  event.preventDefault();
  void sendInput(input).catch(reportError);
}

function handleKeyboardCaptureInput(): void {
  if (!sessionId || stopping) {
    keyboardCapture.value = "";
    return;
  }

  if (keyboardCapture.value.length === 0) {
    return;
  }

  const input = keyboardCapture.value;
  keyboardCapture.value = "";
  void sendInput(input).catch(reportError);
}

function handleKeyboardCapturePaste(event: ClipboardEvent): void {
  if (!sessionId || stopping) {
    return;
  }

  const pastedText = event.clipboardData?.getData("text");
  if (!pastedText) {
    return;
  }

  event.preventDefault();
  void sendInput(pastedText).catch(reportError);
}

function createKeyboardCapture(container: HTMLElement): HTMLTextAreaElement {
  const input = document.createElement("textarea");
  input.className = "terminal-keyboard-capture";
  input.setAttribute("aria-label", "Terminal input");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.spellcheck = false;
  container.appendChild(input);
  return input;
}

function focusKeyboardCapture(): void {
  keyboardCapture.focus();
}

function readStoredSessionId(): string | null {
  return window.localStorage.getItem(storedSessionKey);
}

function writeStoredSessionId(value: string): void {
  window.localStorage.setItem(storedSessionKey, value);
}

function clearStoredSessionId(): void {
  window.localStorage.removeItem(storedSessionKey);
}

function readBrowserRuntimeConfig(): BrowserRuntimeConfig {
  const runtimeConfig = window.__CSH_BROWSER_CONFIG__;
  if (
    !runtimeConfig ||
    typeof runtimeConfig.apiToken !== "string" ||
    typeof runtimeConfig.stateNamespace !== "string" ||
    typeof runtimeConfig.scrollbackLines !== "number"
  ) {
    throw new Error("Missing browser runtime configuration");
  }

  return runtimeConfig;
}

declare global {
  interface Window {
    __CSH_BROWSER_CONFIG__?: BrowserRuntimeConfig;
  }
}
