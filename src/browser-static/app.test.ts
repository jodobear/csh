import { describe, expect, test } from "bun:test";
import {
  applyProfileSelection,
  appendTerminalMirror,
  resolveInitialSettings,
  resolveInitialSelectedProfileLabel,
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

  test("applies a saved profile onto the browser connect form", () => {
    const applied = applyProfileSelection(
      {
        relayUrls: ["wss://current.example"],
        serverPubkey: "c".repeat(64),
        signerKind: "amber",
        bunkerConnectionUri: "",
      },
      [
        {
          version: 1,
          label: "Private Relay",
          relayUrls: ["ws://127.0.0.1:10552"],
          serverPubkey: "a".repeat(64),
          preferredSignerKind: "nip07",
          bunkerConnectionUri: "",
        },
      ],
      "Private Relay",
    );

    expect(applied).toEqual({
      relayUrls: ["ws://127.0.0.1:10552"],
      serverPubkey: "a".repeat(64),
      signerKind: "nip07",
      bunkerConnectionUri: "",
    });
  });

  test("keeps the selected saved profile only when it still exists", () => {
    expect(resolveInitialSelectedProfileLabel([{ label: "Private Relay" }], "Private Relay")).toBe("Private Relay");
    expect(resolveInitialSelectedProfileLabel([{ label: "Private Relay" }], "Missing")).toBe("manual");
    expect(resolveInitialSelectedProfileLabel([], null)).toBe("manual");
  });
});
