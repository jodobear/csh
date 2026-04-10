import { describe, expect, test } from "bun:test";

import { requireConnectedBrowserState } from "./browser-proof-state";

describe("requireConnectedBrowserState", () => {
  test("returns the state when actor and session are concrete", () => {
    expect(
      requireConnectedBrowserState({
        status: "Connected",
        actor: "a".repeat(64),
        session: "session-123",
      }),
    ).toEqual({
      status: "Connected",
      actor: "a".repeat(64),
      session: "session-123",
    });
  });

  test("rejects browser error statuses", () => {
    expect(() =>
      requireConnectedBrowserState({
        status: "Error: timed out",
        actor: "a".repeat(64),
        session: "session-123",
      }),
    ).toThrow("Error: timed out");
  });

  test("rejects unresolved actors and sessions", () => {
    expect(() =>
      requireConnectedBrowserState({
        status: "Connecting",
        actor: "pending",
        session: "pending",
      }),
    ).toThrow("Browser actor did not resolve");
  });
});
