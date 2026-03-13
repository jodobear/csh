import { createContextVmShellBridge } from "./contextvm-bridge.js";
import { startBrowserServer } from "./server-core.js";

await startBrowserServer({
  createShellBridge: createContextVmShellBridge,
  modeLabel: "contextvm",
  description: "Browser shell loop over ContextVM using the private remote csh gateway.",
});
