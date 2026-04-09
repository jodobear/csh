import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { AuthStateStore } from "./state.js";
import { AuthService, resolveAuthenticatedPubkey, resolveSessionActor } from "./server.js";

const PUBKEY_A = "a".repeat(64);
const PUBKEY_B = "b".repeat(64);
const PUBKEY_C = "c".repeat(64);

describe("auth server contract", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "csh-auth-server-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("seeds allowlisted pubkeys and allows shell access for authenticated signers", async () => {
    const auth = createAuthService({
      GW_ALLOWED_PUBLIC_KEYS: `${PUBKEY_A},${PUBKEY_B}`,
      CSH_SERVER_NAME: "phase9-host",
    });

    const status = await auth.authStatus(withClient(PUBKEY_A));
    expect(status.actorPubkey).toBe(PUBKEY_A);
    expect(status.allowlisted).toBe(true);
    expect(status.serverName).toBe("phase9-host");

    await expect(auth.resolveShellActorId(undefined, withClient(PUBKEY_A))).resolves.toBe(PUBKEY_A);
  });

  test("rejects non-allowlisted authenticated signers for shell tools", async () => {
    const auth = createAuthService({
      GW_ALLOWED_PUBLIC_KEYS: PUBKEY_A,
    });

    const status = await auth.authStatus(withClient(PUBKEY_B));
    expect(status.allowlisted).toBe(false);

    await expect(auth.resolveShellActorId(undefined, withClient(PUBKEY_B))).rejects.toThrow(
      /not allowlisted/,
    );
  });

  test("redeems an invite and grants shell access immediately", async () => {
    const store = new AuthStateStore(path.join(tempDir, "auth"));
    await store.initializeWithSeedPubkeys([PUBKEY_A]);
    const invite = await store.createInvite({ label: "browser" });
    const auth = new AuthService(store, {
      CSH_SERVER_NAME: "phase9-host",
    });

    const redeemed = await auth.redeemInvite(invite.inviteToken, withClient(PUBKEY_C));
    expect(redeemed.actorPubkey).toBe(PUBKEY_C);
    expect(redeemed.allowlisted).toBe(true);

    await expect(auth.resolveShellActorId(undefined, withClient(PUBKEY_C))).resolves.toBe(PUBKEY_C);
  });

  test("preserves ownerId mismatch protection for authenticated clients", async () => {
    const auth = createAuthService({
      GW_ALLOWED_PUBLIC_KEYS: PUBKEY_A,
    });

    await expect(auth.resolveShellActorId(PUBKEY_B, withClient(PUBKEY_A))).rejects.toThrow(
      /does not match the authenticated client identity/,
    );
  });

  test("allows local forced-owner mode to bypass the allowlist for admin fallback flows", async () => {
    const auth = createAuthService({
      CSH_FORCED_OWNER_ID: "local-bridge-owner",
    });

    await expect(auth.resolveShellActorId(undefined, {})).resolves.toBe("local-bridge-owner");
  });

  test("requires an authenticated Nostr signer for auth tools", () => {
    expect(() => resolveAuthenticatedPubkey({}, {})).toThrow(/Authenticated Nostr signer is required/);
  });

  test("allows unauthenticated local owner mode only when explicitly enabled", () => {
    expect(resolveSessionActor(undefined, {}, { CSH_ALLOW_UNAUTHENTICATED_OWNER: "1" })).toEqual({
      actorId: "local",
      authenticatedPubkey: null,
      bypassAllowlist: true,
    });

    expect(() => resolveSessionActor(undefined, {}, {})).toThrow(
      /Authenticated client identity is required/,
    );
  });

  function createAuthService(env: NodeJS.ProcessEnv): AuthService {
    return new AuthService(new AuthStateStore(path.join(tempDir, "auth")), env);
  }

  function withClient(pubkey: string): unknown {
    return {
      _meta: {
        clientPubkey: pubkey,
      },
    };
  }
});
