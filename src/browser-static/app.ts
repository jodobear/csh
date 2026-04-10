import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import "./app.css";
import {
  appendTerminalMirror,
  resolveInitialSettings,
  shouldRedeemInvite,
  shouldStartWithExpandedSettings,
  type PreviewConfig,
} from "./app-model.js";
import { createBrowserShellClient } from "./client.js";
import { createAmberSigner, createBunkerSignerAdapter, createNip07Signer, type BrowserSigner } from "./signers.js";
import {
  clearStoredSettings,
  deriveSessionStateNamespace,
  normalizeStoredSettings,
  readStoredSettings,
  writeStoredSettings,
  type BrowserSignerSelection,
  type StoredBrowserSettings,
} from "./storage.js";

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
  snapshotBase64?: string | null;
  delta?: string | null;
  deltaBase64?: string | null;
  cols: number;
  rows: number;
  closedAt: string | null;
  exitStatus: number | null;
};

type UiElements = {
  appRoot: HTMLElement;
  relayInput: HTMLTextAreaElement;
  serverPubkeyInput: HTMLInputElement;
  signerSelect: HTMLSelectElement;
  bunkerInput: HTMLInputElement;
  inviteInput: HTMLInputElement;
  connectButton: HTMLButtonElement;
  toggleSettingsButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  reconnectButton: HTMLButtonElement;
  interruptButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  statusText: HTMLElement;
  sessionText: HTMLElement;
  actorText: HTMLElement;
  modeText: HTMLElement;
  terminalOutput: HTMLElement;
  terminalContainer: HTMLElement;
  bannerText: HTMLElement;
};

const previewConfig = readPreviewConfig();
const ui = getUiElements();
const terminal = new Terminal({
  cursorBlink: true,
  convertEol: true,
  scrollback: 10_000,
  fontFamily:
    '"IBM Plex Mono", "JetBrains Mono", "Symbols Nerd Font Mono", "Symbols Nerd Font", "Noto Sans Symbols 2", "Noto Sans Symbols", "SFMono-Regular", monospace',
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
void warmTerminalFonts();
ui.terminalContainer.addEventListener("click", focusKeyboardCapture);
window.addEventListener("focus", focusKeyboardCapture);

const storedSettings = readStoredSettings(window.localStorage);
const initialSettings = resolveInitialSettings(previewConfig, storedSettings);
ui.relayInput.value = initialSettings.relayUrls.join("\n");
ui.serverPubkeyInput.value = initialSettings.serverPubkey;
ui.signerSelect.value = initialSettings.signerKind;
ui.bunkerInput.value = initialSettings.bunkerConnectionUri;
ui.modeText.textContent = previewConfig.modeLabel ?? "static";

let activeClient: Awaited<ReturnType<typeof createBrowserShellClient>> | null = null;
let activeActorPubkey: string | null = null;
let sessionId: string | null = null;
let cursor: number | null = null;
let stopping = false;
let closed = false;
let pollTimer: number | null = null;
let pollInFlight = false;
let inputFlushTimer: number | null = null;
let pendingInputChunks: Uint8Array[] = [];
let rpcChain = Promise.resolve();
let writeChain = Promise.resolve();
let reconnectFallbackMessage: string | null = null;
const textEncoder = new TextEncoder();

const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  if (!sessionId || !activeClient || stopping) {
    return;
  }

  void queueRpc(async () => {
    await activeClient?.resizeSession({
      sessionId,
      ...getTerminalSize(),
    });
  }).catch(reportError);
});
resizeObserver.observe(ui.terminalContainer);

keyboardCapture.addEventListener("keydown", handleKeyboardCaptureKeydown);
keyboardCapture.addEventListener("input", handleKeyboardCaptureInput);
keyboardCapture.addEventListener("paste", handleKeyboardCapturePaste);

ui.connectButton.addEventListener("click", () => {
  void connectAndOpenSession().catch(reportError);
});
ui.toggleSettingsButton.addEventListener("click", () => {
  setSettingsExpanded(ui.appRoot.dataset.settingsExpanded !== "true");
});
ui.resetButton.addEventListener("click", () => {
  clearStoredSettings(window.localStorage);
  ui.inviteInput.value = "";
  setStatus("Cleared saved browser settings");
});
ui.reconnectButton.addEventListener("click", () => {
  void reconnectOrOpenSession().catch(reportError);
});
ui.interruptButton.addEventListener("click", () => {
  void interruptRemote().catch(reportError);
});
ui.closeButton.addEventListener("click", () => {
  void closeRemoteSession("Session closed from browser").catch(reportError);
});

setStatus("Enter relay, server, and signer settings to connect");
setControlsDisabled(false, true);
setSettingsExpanded(shouldStartWithExpandedSettings(null));

async function connectAndOpenSession(): Promise<void> {
  await connectClient();
  sessionId = null;
  cursor = null;
  clearStoredSessionId();
  await openFreshSession();
}

async function connectClient(): Promise<void> {
  const settings = collectSettings();
  setStatus(`Resolving ${settings.signerKind.toUpperCase()} signer...`);
  const signer = await resolveSigner(settings.signerKind, {
    bunkerConnectionUri: settings.bunkerConnectionUri,
  });
  if (!signer.nip44?.encrypt || !signer.nip44?.decrypt) {
    throw new Error(`${signer.label} does not support NIP-44 encryption required by ContextVM`);
  }
  setStatus("Connecting to ContextVM shell gateway...");
  const nextClient = await createBrowserShellClient({
    signer,
    relayUrls: settings.relayUrls,
    serverPubkey: settings.serverPubkey,
  });
  setStatus("Checking shell access...");
  const authStatus = await nextClient.authStatus();
  if (shouldRedeemInvite(authStatus, ui.inviteInput.value)) {
    setStatus("Redeeming invite...");
    await nextClient.redeemInvite(ui.inviteInput.value.trim());
  }
  setStatus("Verifying shell access...");
  const verifiedStatus = await nextClient.authStatus();
  if (!verifiedStatus.allowlisted) {
    await nextClient.close();
    throw new Error("Authenticated signer is not allowlisted and no valid invite was redeemed");
  }

  writeStoredSettings(window.localStorage, settings);
  activeClient = nextClient;
  activeActorPubkey = verifiedStatus.actorPubkey;
  ui.actorText.textContent = verifiedStatus.actorPubkey;
  setStatus(`Connected as ${verifiedStatus.actorPubkey} to ${verifiedStatus.serverName}`);
  setBanner(
    settings.signerKind === "test"
      ? "Preview signer active. Do not use preview keys outside local verification."
      : `Authenticated with ${settings.signerKind.toUpperCase()}.`,
  );
  setControlsDisabled(false, false);
  setSettingsExpanded(false);
}

async function reconnectOrOpenSession(): Promise<void> {
  if (!activeClient) {
    await connectClient();
  }
  sessionId = readStoredSessionId();
  cancelPollLoop();
  stopping = false;
  closed = false;
  cursor = null;
  terminal.reset();
  fitAddon.fit();
  focusKeyboardCapture();

  if (sessionId) {
    setStatus("Reattaching to existing session...");
    setSessionLabel(sessionId);
    try {
      await queueRpc(() =>
        activeClient!.resizeSession({
          sessionId: sessionId!,
          ...getTerminalSize(),
        }),
      );
      setStatus("Reattached to existing session");
      setControlsDisabled(false, false);
      setSettingsExpanded(false);
      await pollRemote();
      return;
    } catch (error) {
      console.warn("Reattach failed, opening a fresh session", error);
      reconnectFallbackMessage = `Opened a new session because ${sessionId} could not be reattached`;
      sessionId = null;
      clearStoredSessionId();
    }
  }

  await openFreshSession();
}

async function openFreshSession(): Promise<void> {
  cancelPollLoop();
  stopping = false;
  closed = false;
  cursor = null;
  terminal.reset();
  fitAddon.fit();
  focusKeyboardCapture();
  setStatus("Opening shell session...");
  const opened = await queueRpc(() =>
    activeClient!.openSession({
      ...getTerminalSize(),
    }),
  );

  sessionId = opened.sessionId;
  cursor = null;
  writeStoredSessionId(collectSettings(), opened.sessionId);
  setStatus(reconnectFallbackMessage ?? `Connected to ${opened.command}`);
  reconnectFallbackMessage = null;
  setSessionLabel(opened.sessionId);
  setControlsDisabled(false, false);
  setSettingsExpanded(false);
  await pollRemote();
}

async function interruptRemote(): Promise<void> {
  if (!sessionId || !activeClient || stopping) {
    return;
  }

  await queueRpc(() =>
    activeClient!.signalSession({
      sessionId: sessionId!,
      signal: "SIGINT",
    }),
  );
  setStatus("Sent SIGINT to remote session");
}

async function sendBytes(input: Uint8Array): Promise<void> {
  if (!sessionId || !activeClient || stopping) {
    return;
  }

  pendingInputChunks.push(input);
  const flushDelayMs = shouldFlushImmediately(input) ? 0 : 18;
  if (inputFlushTimer !== null && flushDelayMs > 0) {
    return;
  }
  if (inputFlushTimer !== null) {
    window.clearTimeout(inputFlushTimer);
  }

  await new Promise<void>((resolve) => {
    inputFlushTimer = window.setTimeout(() => {
      inputFlushTimer = null;
      void flushPendingInput().then(resolve, resolve);
    }, flushDelayMs);
  });
}

async function flushPendingInput(): Promise<void> {
  if (!sessionId || !activeClient || stopping || pendingInputChunks.length === 0) {
    pendingInputChunks = [];
    return;
  }

  cancelPollLoop();
  const encoded = encodeBase64(joinChunks(pendingInputChunks));
  pendingInputChunks = [];
  const next = writeChain.then(
    () =>
      activeClient!.writeSession({
        sessionId: sessionId!,
        inputBase64: encoded,
      }),
    () =>
      activeClient!.writeSession({
        sessionId: sessionId!,
        inputBase64: encoded,
      }),
  );
  writeChain = next.then(
    () => undefined,
    () => undefined,
  );
  await next;
  if (!closed && sessionId) {
    schedulePoll(20);
  }
}

async function closeRemoteSession(statusMessage: string): Promise<void> {
  if (!sessionId || !activeClient || stopping) {
    return;
  }

  stopping = true;
  cancelPollLoop();

  try {
    await queueRpc(() => activeClient!.closeSession(sessionId!));
    clearStoredSessionId();
    sessionId = null;
    closed = true;
    setStatus(statusMessage);
    setSessionLabel("closed");
    setControlsDisabled(false, true);
  } finally {
    stopping = false;
  }
}

function schedulePoll(delayMs = 90): void {
  cancelPollLoop();
  pollTimer = window.setTimeout(() => {
    void pollRemote().catch(reportError);
  }, delayMs);
}

function cancelPollLoop(): void {
  if (pollTimer !== null) {
    window.clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function pollRemote(): Promise<void> {
  if (!sessionId || !activeClient || stopping || pollInFlight) {
    return;
  }

  pollInFlight = true;
  try {
    const result = await activeClient!.pollSession({
      sessionId: sessionId!,
      keepAlive: document.visibilityState === "visible",
      ...(cursor === null ? {} : { cursor }),
    });

    cursor = result.cursor;
    if (result.snapshotBase64) {
      renderSnapshot(result.snapshotBase64);
    } else if (result.deltaBase64) {
      renderDelta(result.deltaBase64);
    }

    if (result.closedAt) {
      closed = true;
      clearStoredSessionId();
      sessionId = null;
      setStatus(`Remote session closed${result.exitStatus !== null ? ` with status ${result.exitStatus}` : ""}`);
      setSessionLabel("closed");
      setControlsDisabled(false, true);
      setSettingsExpanded(true);
      return;
    }
  } catch (error) {
    if (isBrowserTimeoutError(error)) {
      setStatus("Waiting on relay response...");
      schedulePoll(250);
      return;
    }
    throw error;
  } finally {
    pollInFlight = false;
  }

  schedulePoll();
}

function renderSnapshot(snapshotBase64: string): void {
  terminal.reset();
  const snapshot = decodeBase64(snapshotBase64);
  terminal.write(snapshot);
  ui.terminalOutput.textContent = appendTerminalMirror("", new TextDecoder().decode(snapshot));
}

function renderDelta(deltaBase64: string): void {
  const delta = decodeBase64(deltaBase64);
  terminal.write(delta);
  ui.terminalOutput.textContent = appendTerminalMirror(
    ui.terminalOutput.textContent ?? "",
    new TextDecoder().decode(delta),
  );
}

function collectSettings(): StoredBrowserSettings {
  return normalizeStoredSettings({
    relayUrls: ui.relayInput.value.split(/\r?\n/),
    serverPubkey: ui.serverPubkeyInput.value,
    signerKind: ui.signerSelect.value as BrowserSignerSelection,
    bunkerConnectionUri: ui.bunkerInput.value,
  });
}

async function resolveSigner(
  signerKind: BrowserSignerSelection,
  input: { bunkerConnectionUri: string },
): Promise<BrowserSigner> {
  switch (signerKind) {
    case "nip07":
      return createNip07Signer(window.nostr);
    case "bunker":
      if (!input.bunkerConnectionUri) {
        throw new Error("Bunker signer requires a bunker connection URI");
      }
      return await createBunkerSignerAdapter({
        connectionUri: input.bunkerConnectionUri,
        clientSecretKeyHex: randomPrivateKeyHex(),
      });
    case "amber":
      return createAmberSigner({
        bridge: {
          async request(uri) {
            window.location.href = uri;
            throw new Error("Amber signing requires a nostrsigner-compatible return flow");
          },
        },
        appName: "csh",
      });
    case "test":
      if (!__CSH_BROWSER_ENABLE_TEST_SIGNER__ || !previewConfig.enableTestSigner || !previewConfig.testSignerPrivateKey) {
        throw new Error("Preview test signer is unavailable");
      }
      return (await import("./signers-test.js")).createTestSigner({
        privateKeyHex: previewConfig.testSignerPrivateKey,
      });
  }
}

function readStoredSessionId(): string | null {
  const actorPubkey = activeActorPubkey;
  if (!actorPubkey) {
    return null;
  }
  const settings = collectSettings();
  return (
    window.localStorage.getItem(sessionStorageKey(settings, actorPubkey)) ??
    window.localStorage.getItem(legacySessionStorageKey(settings))
  );
}

function writeStoredSessionId(settings: StoredBrowserSettings, value: string): void {
  const actorPubkey = activeActorPubkey;
  if (!actorPubkey) {
    return;
  }
  window.localStorage.setItem(sessionStorageKey(settings, actorPubkey), value);
  window.localStorage.removeItem(legacySessionStorageKey(settings));
}

function clearStoredSessionId(): void {
  const actorPubkey = activeActorPubkey;
  if (!actorPubkey) {
    return;
  }
  const settings = collectSettings();
  window.localStorage.removeItem(sessionStorageKey(settings, actorPubkey));
  window.localStorage.removeItem(legacySessionStorageKey(settings));
}

function sessionStorageKey(settings: StoredBrowserSettings, actorPubkey: string): string {
  return `csh.browser-static.sessionId.${deriveSessionStateNamespace({
    relayUrls: settings.relayUrls,
    serverPubkey: settings.serverPubkey,
    actorPubkey,
  })}`;
}

function legacySessionStorageKey(settings: StoredBrowserSettings): string {
  return `csh.browser-static.sessionId.static:${settings.serverPubkey.trim().toLowerCase()}:${settings.relayUrls.join(",")}`;
}

function reportError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Error: ${message}`);
  setControlsDisabled(false, true);
  setSettingsExpanded(true);
  pendingInputChunks = [];
  if (inputFlushTimer !== null) {
    window.clearTimeout(inputFlushTimer);
    inputFlushTimer = null;
  }
  console.error(error);
}

function isBrowserTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /request timed out/i.test(message);
}

function queueRpc<T>(operation: () => Promise<T>): Promise<T> {
  const next = rpcChain.then(operation, operation);
  rpcChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const joined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function shouldFlushImmediately(input: Uint8Array): boolean {
  return input.some((byte) => byte === 0x03 || byte === 0x0a || byte === 0x0d || byte === 0x1b);
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

function setBanner(message: string): void {
  ui.bannerText.textContent = message;
}

function setControlsDisabled(disabled: boolean, closedState = false): void {
  ui.connectButton.disabled = disabled;
  ui.toggleSettingsButton.disabled = disabled;
  ui.resetButton.disabled = disabled;
  ui.reconnectButton.disabled = disabled || (!closed && Boolean(sessionId));
  ui.interruptButton.disabled = disabled || closedState || !sessionId;
  ui.closeButton.disabled = disabled || closedState || !sessionId;
}

function setSettingsExpanded(expanded: boolean): void {
  ui.appRoot.dataset.settingsExpanded = expanded ? "true" : "false";
  ui.toggleSettingsButton.textContent = expanded ? "Hide Setup" : "Show Setup";
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
  void sendBytes(textEncoder.encode(input)).catch(reportError);
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
  void sendBytes(textEncoder.encode(input)).catch(reportError);
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
  void sendBytes(textEncoder.encode(pastedText)).catch(reportError);
}

function createKeyboardCapture(container: HTMLElement): HTMLTextAreaElement {
  const input = document.createElement("textarea");
  input.className = "terminal-keyboard-capture";
  input.setAttribute("data-terminal-input", "1");
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

async function warmTerminalFonts(): Promise<void> {
  if (!("fonts" in document)) {
    return;
  }
  try {
    await document.fonts.load('14px "MesloLGS NF"');
    await document.fonts.ready;
    terminal.options.fontFamily =
      '"MesloLGS NF", "Noto Sans Mono", "IBM Plex Mono", "JetBrains Mono", "SFMono-Regular", monospace';
    fitAddon.fit();
  } catch (error) {
    console.warn("Terminal font preload failed", error);
  }
}

function getUiElements(): UiElements {
  const appRoot = document.querySelector<HTMLElement>(".shell-app");
  const relayInput = document.querySelector<HTMLTextAreaElement>("[data-field='relays']");
  const serverPubkeyInput = document.querySelector<HTMLInputElement>("[data-field='server-pubkey']");
  const signerSelect = document.querySelector<HTMLSelectElement>("[data-field='signer']");
  const bunkerInput = document.querySelector<HTMLInputElement>("[data-field='bunker-uri']");
  const inviteInput = document.querySelector<HTMLInputElement>("[data-field='invite']");
  const connectButton = document.querySelector<HTMLButtonElement>("[data-action='connect']");
  const toggleSettingsButton = document.querySelector<HTMLButtonElement>("[data-action='toggle-settings']");
  const resetButton = document.querySelector<HTMLButtonElement>("[data-action='reset']");
  const reconnectButton = document.querySelector<HTMLButtonElement>("[data-action='reconnect']");
  const interruptButton = document.querySelector<HTMLButtonElement>("[data-action='interrupt']");
  const closeButton = document.querySelector<HTMLButtonElement>("[data-action='close']");
  const statusText = document.querySelector<HTMLElement>("[data-status]");
  const sessionText = document.querySelector<HTMLElement>("[data-session]");
  const actorText = document.querySelector<HTMLElement>("[data-actor]");
  const modeText = document.querySelector<HTMLElement>("[data-mode]");
  const terminalOutput = document.querySelector<HTMLElement>("[data-terminal-output]");
  const bannerText = document.querySelector<HTMLElement>("[data-banner]");
  const terminalContainer = document.querySelector<HTMLElement>("[data-terminal]");

  if (
    !appRoot ||
    !relayInput ||
    !serverPubkeyInput ||
    !signerSelect ||
    !bunkerInput ||
    !inviteInput ||
    !connectButton ||
    !toggleSettingsButton ||
    !resetButton ||
    !reconnectButton ||
    !interruptButton ||
    !closeButton ||
    !statusText ||
    !sessionText ||
    !actorText ||
    !modeText ||
    !terminalOutput ||
    !bannerText ||
    !terminalContainer
  ) {
    throw new Error("Static browser UI is missing required DOM elements");
  }

  return {
    appRoot,
    relayInput,
    serverPubkeyInput,
    signerSelect,
    bunkerInput,
    inviteInput,
    connectButton,
    toggleSettingsButton,
    resetButton,
    reconnectButton,
    interruptButton,
    closeButton,
    statusText,
    sessionText,
    actorText,
    modeText,
    terminalOutput,
    bannerText,
    terminalContainer,
  };
}

function readPreviewConfig(): PreviewConfig {
  return window.__CSH_BROWSER_STATIC_PREVIEW__ ?? {};
}

function randomPrivateKeyHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: {
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
      }): Promise<{
        id: string;
        pubkey: string;
        created_at: number;
        kind: number;
        tags: string[][];
        content: string;
        sig: string;
      }>;
    };
    __CSH_BROWSER_STATIC_PREVIEW__?: PreviewConfig;
  }
}

declare const __CSH_BROWSER_ENABLE_TEST_SIGNER__: boolean;
