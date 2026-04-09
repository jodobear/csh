import { describe, expect, test } from "bun:test";

import { applyEnvDefaults } from "./startup-env";

describe("applyEnvDefaults", () => {
  test("fills missing values from the env file map", () => {
    const env: NodeJS.ProcessEnv = {};

    applyEnvDefaults(
      {
        CVM_RELAYS: "ws://127.0.0.1:10552",
        CSH_BROWSER_PORT: "4318",
      },
      env,
    );

    expect(env.CVM_RELAYS).toBe("ws://127.0.0.1:10552");
    expect(env.CSH_BROWSER_PORT).toBe("4318");
  });

  test("preserves explicit runtime overrides", () => {
    const env: NodeJS.ProcessEnv = {
      CVM_RELAYS: "ws://127.0.0.1:10553",
      CSH_BROWSER_PORT: "43180",
    };

    applyEnvDefaults(
      {
        CVM_RELAYS: "ws://127.0.0.1:10552",
        CSH_BROWSER_PORT: "4318",
      },
      env,
    );

    expect(env.CVM_RELAYS).toBe("ws://127.0.0.1:10553");
    expect(env.CSH_BROWSER_PORT).toBe("43180");
  });
});
