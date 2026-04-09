import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { AuthStateStore } from "./state";

const PUBKEY_A = "a".repeat(64);
const PUBKEY_B = "b".repeat(64);
const PUBKEY_C = "c".repeat(64);

describe("auth state store", () => {
  test("seeds env pubkeys and preserves private file modes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-auth-state-"));

    try {
      const store = new AuthStateStore(path.join(root, "auth"));
      await store.initializeWithSeedPubkeys([PUBKEY_B, PUBKEY_A]);

      const entries = await store.listAllowlist();
      expect(entries.map((entry) => entry.pubkey)).toEqual([PUBKEY_A, PUBKEY_B]);
      expect(entries.every((entry) => entry.source === "env")).toBe(true);

      const allowlistPath = path.join(root, "auth", "allowlist.json");
      const invitesPath = path.join(root, "auth", "invites.json");
      expect(statSync(path.join(root, "auth")).mode & 0o777).toBe(0o700);
      expect(statSync(allowlistPath).mode & 0o777).toBe(0o600);
      expect(statSync(invitesPath).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("adds and removes admin allowlist entries deterministically", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-auth-admin-"));

    try {
      const store = new AuthStateStore(path.join(root, "auth"));
      await store.addAllowlistEntry({ pubkey: PUBKEY_B, label: "beta" });
      await store.addAllowlistEntry({ pubkey: PUBKEY_A, label: "alpha" });

      const entries = await store.listAllowlist();
      expect(entries.map((entry) => [entry.pubkey, entry.label, entry.source])).toEqual([
        [PUBKEY_A, "alpha", "admin"],
        [PUBKEY_B, "beta", "admin"],
      ]);

      expect(await store.removeAllowlistEntry(PUBKEY_A)).toBe(true);
      expect(await store.removeAllowlistEntry(PUBKEY_A)).toBe(false);
      expect((await store.listAllowlist()).map((entry) => entry.pubkey)).toEqual([PUBKEY_B]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("creates one-time invites and stores only token hashes", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-auth-invite-"));

    try {
      const store = new AuthStateStore(path.join(root, "auth"));
      const created = await store.createInvite({ label: "browser", ttlSeconds: 3600 });

      expect(created.inviteToken.startsWith("cshinv_")).toBe(true);
      expect(created.invite.label).toBe("browser");
      expect(created.invite.expiresAt).not.toBeNull();

      const inviteText = readFileSync(path.join(root, "auth", "invites.json"), "utf8");
      expect(inviteText.includes(created.inviteToken)).toBe(false);
      expect(inviteText.includes(created.inviteId)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("redeems an invite exactly once and allowlists the actor", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-auth-redeem-"));

    try {
      const store = new AuthStateStore(path.join(root, "auth"));
      const created = await store.createInvite({ label: "new-browser" });

      const redeemed = await store.redeemInvite(PUBKEY_C, created.inviteToken);
      expect(redeemed.pubkey).toBe(PUBKEY_C);
      expect(redeemed.source).toBe("invite");
      expect(redeemed.invitedByTokenId).toBe(created.inviteId);
      expect(await store.isAllowlisted(PUBKEY_C)).toBe(true);

      await expect(store.redeemInvite(PUBKEY_B, created.inviteToken)).rejects.toThrow(
        /already been redeemed/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects expired and revoked invites", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-auth-invalid-invite-"));

    try {
      const store = new AuthStateStore(path.join(root, "auth"));
      const expired = await store.createInvite({ ttlSeconds: 1 });
      const revoked = await store.createInvite();
      await store.revokeInvite(revoked.inviteId);

      await Bun.sleep(1100);

      await expect(store.redeemInvite(PUBKEY_A, expired.inviteToken)).rejects.toThrow(/expired/);
      await expect(store.redeemInvite(PUBKEY_A, revoked.inviteToken)).rejects.toThrow(/revoked/);
      await expect(store.redeemInvite(PUBKEY_A, "cshinv_invalid")).rejects.toThrow(/Invalid invite/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
