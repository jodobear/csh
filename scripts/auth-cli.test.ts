import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addAllowlistEntry,
  createInvite,
  listAllowlistEntries,
  listInvites,
  removeAllowlistEntry,
  revokeInvite,
} from "./auth-cli";

const PUBKEY_A = "a".repeat(64);
const PUBKEY_B = "b".repeat(64);

describe("auth cli helpers", () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "csh-auth-cli-"));
    configPath = path.join(tempDir, "phase9.env");
    writeFileSync(
      configPath,
      [
        `CSH_AUTH_STATE_DIR="${path.join(tempDir, "auth")}"`,
        `GW_ALLOWED_PUBLIC_KEYS="${PUBKEY_A}"`,
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("lists seeded allowlist entries and supports add/remove", async () => {
    const seeded = await listAllowlistEntries(configPath);
    expect(seeded.map((entry) => entry.pubkey)).toEqual([PUBKEY_A]);

    const created = await addAllowlistEntry(PUBKEY_B, {
      configPath,
      label: "browser",
    });
    expect(created.pubkey).toBe(PUBKEY_B);
    expect(created.label).toBe("browser");
    expect(created.source).toBe("admin");

    const listed = await listAllowlistEntries(configPath);
    expect(listed.map((entry) => entry.pubkey)).toEqual([PUBKEY_A, PUBKEY_B]);

    expect(await removeAllowlistEntry(PUBKEY_B, configPath)).toBe(true);
    expect(await removeAllowlistEntry(PUBKEY_B, configPath)).toBe(false);
  });

  test("creates invites without leaking plaintext into invite metadata and supports revocation", async () => {
    const invite = await createInvite({
      configPath,
      label: "browser",
      ttlSeconds: 600,
    });

    expect(invite.inviteToken.startsWith("cshinv_")).toBe(true);

    const listed = await listInvites(configPath);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.label).toBe("browser");
    expect(JSON.stringify(listed)).not.toContain(invite.inviteToken);

    const inviteFile = readFileSync(path.join(tempDir, "auth", "invites.json"), "utf8");
    expect(inviteFile).not.toContain(invite.inviteToken);

    expect(await revokeInvite(invite.inviteId, configPath)).toBe(true);
    expect(await revokeInvite("missing", configPath)).toBe(false);
  });
});
