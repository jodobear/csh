import { describe, expect, test } from "bun:test";
import {
  appendTerminalMirror,
  resolveInitialSettings,
  shouldRedeemInvite,
  shouldStartWithExpandedSettings,
  TERMINAL_MIRROR_LIMIT,
} from "./app-model";

describe("browser static app helpers", () => {
  test("prefers stored settings over preview defaults", () => {
    expect(
      resolveInitialSettings(
        {
          defaultRelayUrls: ["wss://preview.example"],
          defaultServerPubkey: "a".repeat(64),
          defaultSignerKind: "test",
        },
        {
          relayUrls: ["wss://stored.example"],
          serverPubkey: "b".repeat(64),
          signerKind: "bunker",
          bunkerConnectionUri: "bunker://remote",
        },
      ),
    ).toEqual({
      relayUrls: ["wss://stored.example"],
      serverPubkey: "b".repeat(64),
      signerKind: "bunker",
      bunkerConnectionUri: "bunker://remote",
    });
  });

  test("redeems invites only when auth is denied and a token exists", () => {
    expect(
      shouldRedeemInvite(
        { actorPubkey: "a".repeat(64), allowlisted: false, serverName: "csh" },
        " invite-token ",
      ),
    ).toBe(true);
    expect(
      shouldRedeemInvite(
        { actorPubkey: "a".repeat(64), allowlisted: true, serverName: "csh" },
        "invite-token",
      ),
    ).toBe(false);
    expect(
      shouldRedeemInvite(
        { actorPubkey: "a".repeat(64), allowlisted: false, serverName: "csh" },
        "   ",
      ),
    ).toBe(false);
  });

  test("caps the hidden terminal mirror to the trailing window", () => {
    const initial = "a".repeat(TERMINAL_MIRROR_LIMIT - 4);
    const next = appendTerminalMirror(initial, "bcdefghi");
    expect(next.length).toBe(TERMINAL_MIRROR_LIMIT);
    expect(next.endsWith("bcdefghi")).toBe(true);
    expect(next.startsWith("aaaa")).toBe(true);
  });

  test("starts with setup expanded only when there is no saved session", () => {
    expect(shouldStartWithExpandedSettings(null)).toBe(true);
    expect(shouldStartWithExpandedSettings("session-123")).toBe(false);
  });
});
