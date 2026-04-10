export type BrowserProofState = {
  status: string;
  actor: string;
  session: string;
};

export function requireConnectedBrowserState(state: BrowserProofState): BrowserProofState {
  if (state.status.startsWith("Error:")) {
    throw new Error(state.status);
  }
  if (!state.actor || state.actor === "pending") {
    throw new Error(`Browser actor did not resolve: ${state.actor || "<empty>"}`);
  }
  if (!state.session || state.session === "pending" || state.session === "closed") {
    throw new Error(`Browser session did not open: ${state.session || "<empty>"}`);
  }
  return state;
}
