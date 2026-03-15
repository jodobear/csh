import { loadContextVmClientConfig } from "../contextvm/client-config.js";
import { createContextVmShellBridge } from "./contextvm-bridge.js";
import { startBrowserServer } from "./server-core.js";

const config = loadContextVmClientConfig();

await startBrowserServer({
  createShellBridge: createContextVmShellBridge,
  modeLabel: "contextvm",
  description: "Browser shell loop over ContextVM using the private remote csh gateway.",
  stateNamespace: `contextvm:${config.serverPubkey}:${config.relayUrls.join(",")}`,
});
