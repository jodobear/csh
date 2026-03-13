import { createLocalShellBridge } from "./local-bridge.js";
import { startBrowserServer } from "./server-core.js";

await startBrowserServer({
  createShellBridge: createLocalShellBridge,
  modeLabel: "local",
  description: "Local browser shell loop against the stable csh session contract.",
});
