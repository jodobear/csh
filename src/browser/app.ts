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

const ownerId = crypto.randomUUID();
const pollIntervalMs = 60;

const ui = getUiElements();
const terminal = new Terminal({
  cursorBlink: true,
  convertEol: true,
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
ui.terminalContainer.tabIndex = 0;
fitAddon.fit();
terminal.focus();
ui.terminalContainer.addEventListener("click", () => {
  ui.terminalContainer.focus();
  terminal.focus();
});
window.addEventListener("focus", () => {
  ui.terminalContainer.focus();
  terminal.focus();
});

let sessionId: string | null = null;
let cursor: number | null = null;
let lastSnapshot = "";
let closed = false;
let stopping = false;
let pollTimer: number | null = null;
let rpcChain = Promise.resolve();

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  if (!sessionId || stopping) {
    return;
  }

  void queueRpc(async () => {
    await postJson("session/resize", {
      sessionId,
      ownerId,
      ...getTerminalSize(),
    });
  }).catch(reportError);
});

resizeObserver.observe(ui.terminalContainer);

document.addEventListener(
  "keydown",
  (event) => {
    if (!sessionId || stopping || !isTerminalFocused()) {
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void interruptRemote().catch(reportError);
      return;
    }

    const input = toTerminalInput(event);
    if (input === null) {
      return;
    }

    event.preventDefault();
    void queueRpc(async () => {
      await postJson("session/write", {
        sessionId,
        input,
        ownerId,
      });
    }).catch(reportError);
  },
  true,
);

document.addEventListener(
  "paste",
  (event) => {
    if (!sessionId || stopping || !isTerminalFocused()) {
      return;
    }

    const pastedText = event.clipboardData?.getData("text");
    if (!pastedText) {
      return;
    }

    event.preventDefault();
    void queueRpc(async () => {
      await postJson("session/write", {
        sessionId,
        input: pastedText,
        ownerId,
      });
    }).catch(reportError);
  },
  true,
);

ui.reconnectButton.addEventListener("click", () => {
  void restartSession().catch(reportError);
});

ui.interruptButton.addEventListener("click", () => {
  void interruptRemote().catch(reportError);
});

ui.closeButton.addEventListener("click", () => {
  void closeSession("Session closed from browser").catch(reportError);
});

window.addEventListener("beforeunload", () => {
  if (!sessionId) {
    return;
  }

  const payload = JSON.stringify({
    sessionId,
    ownerId,
  });
  navigator.sendBeacon(
    "/api/session/close",
    new Blob([payload], { type: "application/json" }),
  );
});

await restartSession();

async function restartSession(): Promise<void> {
  cancelPollLoop();
  stopping = false;
  closed = false;
  lastSnapshot = "";
  cursor = null;
  sessionId = null;
  terminal.reset();
  fitAddon.fit();
  terminal.focus();
  ui.terminalContainer.focus();
  setStatus("Connecting to shell bridge...");
  setSessionLabel("opening");
  setControlsDisabled(true);

  const result = await queueRpc(() =>
    postJson<OpenResult>("session/open", {
      command: "/bin/sh",
      ownerId,
      ...getTerminalSize(),
    }),
  );

  sessionId = result.sessionId;
  cursor = null;
  setStatus(`Connected to ${result.command}`);
  setSessionLabel(result.sessionId);
  setControlsDisabled(false);
  ui.terminalContainer.focus();
  terminal.focus();
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
      ownerId,
    }),
  );
  setStatus("Sent SIGINT to remote session");
}

async function closeSession(statusMessage: string): Promise<void> {
  if (!sessionId || stopping) {
    return;
  }

  stopping = true;
  cancelPollLoop();

  const activeSessionId = sessionId;
  sessionId = null;

  try {
    await queueRpc(() =>
      postJson("session/close", {
        sessionId: activeSessionId,
        ownerId,
      }),
    );
  } finally {
    setStatus(statusMessage);
    setSessionLabel("closed");
    setControlsDisabled(false, true);
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
      ...(cursor === null ? {} : { cursor }),
      ownerId,
    }),
  );

  cursor = result.cursor;

  if (result.snapshot !== null && result.snapshot !== lastSnapshot) {
    renderSnapshot(result.snapshot);
  }

  if (result.closedAt) {
    closed = true;
    sessionId = null;
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
  terminal.clear();
  terminal.write(snapshot);
  terminal.scrollToBottom();
  lastSnapshot = snapshot;
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

function isTerminalFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }

  return ui.terminalContainer.contains(activeElement) || activeElement === ui.terminalContainer;
}

function toTerminalInput(event: KeyboardEvent): string | null {
  if (event.metaKey || event.altKey) {
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
