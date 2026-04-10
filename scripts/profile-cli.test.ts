import { describe, expect, test } from "bun:test";
import { exportProfile } from "./profile-cli";

describe("profile cli", () => {
  test("exports a shareable profile without private keys", async () => {
    const profile = await exportProfile("/workspace/projects/csh/.env.csh.local", { label: "local" });
    expect(profile.label).toBe("local");
    expect(profile.serverPubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(profile.relayUrls.length).toBeGreaterThan(0);
    expect(JSON.stringify(profile)).not.toContain("GW_PRIVATE_KEY");
    expect(JSON.stringify(profile)).not.toContain("CVM_CLIENT_PRIVATE_KEY");
  });

  test("prefers explicit runtime relay and server overrides over the env file", async () => {
    const profile = await exportProfile("/workspace/projects/csh/.env.csh.local", {
      label: "override",
      env: {
        CVM_RELAYS: "ws://127.0.0.1:10552",
        CVM_SERVER_PUBKEY: "b".repeat(64),
      },
    });

    expect(profile.label).toBe("override");
    expect(profile.relayUrls).toEqual(["ws://127.0.0.1:10552"]);
    expect(profile.serverPubkey).toBe("b".repeat(64));
  });

  test("allows deterministic signer overrides for browser smoke flows", async () => {
    const profile = await exportProfile("/workspace/projects/csh/.env.csh.local", {
      label: "smoke",
      preferredSignerKind: "test",
    });

    expect(profile.preferredSignerKind).toBe("test");
  });
});
