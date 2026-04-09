import { describe, expect, test } from "bun:test";

import { buildPublicRelayEnv } from "./release-verify";

describe("release verify helpers", () => {
  test("overrides relay and browser settings while preserving unrelated config", () => {
    const result = buildPublicRelayEnv(
      [
        'CVM_RELAYS="ws://127.0.0.1:10552"',
        'CSH_BROWSER_HOST="0.0.0.0"',
        'CSH_BROWSER_PORT="4318"',
        'GW_PRIVATE_KEY="abc123"',
      ].join("\n"),
      {
        relayUrl: "wss://relay.contextvm.org",
        browserHost: "127.0.0.1",
        browserPort: 43180,
      },
    );

    expect(result).toContain('CVM_RELAYS="wss://relay.contextvm.org"');
    expect(result).toContain('CSH_BROWSER_HOST="127.0.0.1"');
    expect(result).toContain('CSH_BROWSER_PORT="43180"');
    expect(result).toContain('GW_PRIVATE_KEY="abc123"');
    expect(result).not.toContain('CVM_RELAYS="ws://127.0.0.1:10552"');
    expect(result).not.toContain('CSH_BROWSER_HOST="0.0.0.0"');
  });

  test("adds missing relay and browser settings when they are absent", () => {
    const result = buildPublicRelayEnv(
      'GW_ALLOWED_PUBLIC_KEYS="pubkey"\nCVM_CLIENT_PRIVATE_KEY="client"',
      {
        relayUrl: "wss://relay.contextvm.org",
        browserHost: "127.0.0.1",
        browserPort: 43181,
      },
    );

    expect(result).toContain('GW_ALLOWED_PUBLIC_KEYS="pubkey"');
    expect(result).toContain('CVM_CLIENT_PRIVATE_KEY="client"');
    expect(result).toContain('CVM_RELAYS="wss://relay.contextvm.org"');
    expect(result).toContain('CSH_BROWSER_HOST="127.0.0.1"');
    expect(result).toContain('CSH_BROWSER_PORT="43181"');
  });
});
