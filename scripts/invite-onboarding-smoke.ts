#!/usr/bin/env bun
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { createInvite, listAllowlistEntries } from "./auth-cli";
import { defaultEnvFile, parseEnvFile, repoRoot } from "./config";
import { loadEnvFile } from "./client-common";
import { parsePlaywrightResult, runPlaywright } from "./playwright-cli";
import { startLoggedProcess, terminateProcess, waitForLogMarker, waitForTcpListener } from "./host-control";
import { createBrowserShellClient } from "../src/browser-static/client";
import { createTestSigner } from "../src/browser-static/signers-test";

const envFile = path.resolve(process.argv[2] ?? process.env.CVM_ENV_FILE ?? defaultEnvFile());
loadEnvFile(envFile);
const values = parseEnvFile(envFile);
const basePort = Number.parseInt(process.env.CSH_INVITE_BROWSER_PORT ?? values.CSH_BROWSER_PORT ?? "43240", 10);
const browserPort = await pickFreeLoopbackPort(basePort);
const logFile = path.join(repoRoot(), ".csh-runtime", "logs", "invite-onboarding-browser.log");
const invite = await createInvite({
  configPath: envFile,
  label: "static-browser",
  ttlSeconds: 600,
});
const testSignerPrivateKey = randomBytes(32).toString("hex");
const relayUrls = (process.env.CVM_RELAYS || process.env.CSH_NOSTR_RELAY_URLS || values.CVM_RELAYS || values.CSH_NOSTR_RELAY_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const serverPubkey = (
  process.env.CVM_SERVER_PUBKEY ||
  process.env.CSH_SERVER_PUBKEY ||
  values.CVM_SERVER_PUBKEY ||
  values.CSH_SERVER_PUBKEY ||
  ""
).trim();
const playwrightSession = `csh-invite-browser-${Date.now()}-${randomUUID()}`;
let browserPid: number | null = null;
let sessionId: string | null = null;

await main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  try {
    const browser = await startLoggedProcess(
      "bun",
      ["run", "scripts/csh.ts", "browser", envFile],
      logFile,
      {
        cwd: repoRoot(),
        env: {
          BUN_TMPDIR: "/tmp",
          BUN_INSTALL: "/tmp/bun-install",
          CSH_BROWSER_PORT: String(browserPort),
          CSH_BROWSER_DEFAULT_SIGNER: "test",
          CSH_BROWSER_TEST_SIGNER_PRIVATE_KEY: testSignerPrivateKey,
        },
      },
    );
    browserPid = browser.pid;
    await waitForLogMarker(logFile, "csh static browser preview listening on", browser.pid, 30_000);
    await waitForTcpListener("127.0.0.1", browserPort, browser.pid, 30_000);

    const baseUrl = `http://127.0.0.1:${browserPort}`;
    await runPlaywright(["open", baseUrl], { session: playwrightSession });
    await runPlaywright(["snapshot"], { session: playwrightSession });
    await runPlaywright(
      [
        "run-code",
        `async page => {
          await page.evaluate(() => {
            const invite = document.querySelector("[data-field='invite']");
            if (!(invite instanceof HTMLInputElement)) {
              throw new Error("invite input was not found");
            }
            invite.value = ${JSON.stringify(invite.inviteToken)};
          });
          await page.locator("[data-action='connect']").click();
          await page.waitForFunction(() => {
            const status = document.querySelector("[data-status]")?.textContent || "";
            const actor = document.querySelector("[data-actor]")?.textContent || "";
            const session = document.querySelector("[data-session]")?.textContent || "";
            return status.startsWith("Error:") || (actor !== "pending" && session !== "pending");
          }, undefined, { timeout: 20000 });
          const status = await page.evaluate(() => document.querySelector("[data-status]")?.textContent || "");
          if (status.startsWith("Error:")) {
            throw new Error(status);
          }
          await page.evaluate(() => {
            const input = document.querySelector("[data-terminal-input]");
            if (!(input instanceof HTMLTextAreaElement)) {
              throw new Error("terminal input capture was not found");
            }
            input.value = "printf '__INVITE__%s\\\\n' \\\"$PWD\\\"\\n";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });
        }`,
      ],
      { session: playwrightSession },
    );
    sessionId = parsePlaywrightResult<string>(
      await runPlaywright(["eval", `document.querySelector("[data-session]")?.textContent || ""`], {
        session: playwrightSession,
      }),
    );

    const client = await createBrowserShellClient({
      signer: createTestSigner({ privateKeyHex: testSignerPrivateKey }),
      relayUrls,
      serverPubkey,
    });
    try {
      const polled = await client.pollSession({
        sessionId,
        keepAlive: true,
      });
      const serialized = JSON.stringify(polled);
      if (!serialized.includes("__INVITE__/")) {
        throw new Error(`Invite onboarding did not observe expected output for session ${sessionId}`);
      }
    } finally {
      if (sessionId) {
        await ignoreCleanupTimeout(() => client.closeSession(sessionId));
      }
      await ignoreCleanupTimeout(() => client.close());
    }
    const actor = await createTestSigner({ privateKeyHex: testSignerPrivateKey }).getPublicKey();
    const allowlist = await listAllowlistEntries(envFile);
    if (!allowlist.some((entry) => entry.pubkey === actor)) {
      throw new Error(`Invite onboarding did not add ${actor} to the persisted allowlist`);
    }

    console.log(
      JSON.stringify(
        {
          browserPort,
          inviteId: invite.inviteId,
          actor,
          sessionId,
        },
        null,
        2,
      ),
    );
  } finally {
    if (browserPid !== null) {
      await ignoreCleanupTimeout(() => terminateProcess(browserPid));
    }
    await ignoreCleanupTimeout(() => runPlaywright(["close"], { session: playwrightSession }));
  }
}

async function pickFreeLoopbackPort(start = 43240, count = 200): Promise<number> {
  for (let port = start; port < start + count; port += 1) {
    const candidate = await Bun.$`bash -lc ${`! ss -ltn 2>/dev/null | grep -q ':${port} '`}`.quiet().nothrow();
    if (candidate.exitCode === 0) {
      return port;
    }
  }
  throw new Error(`Could not find a free loopback port in range ${start}-${start + count - 1}`);
}

async function ignoreCleanupTimeout(operation: () => Promise<unknown>, timeoutMs = 5_000): Promise<void> {
  try {
    await Promise.race([
      operation(),
      Bun.sleep(timeoutMs).then(() => {
        throw new Error(`cleanup timed out after ${timeoutMs}ms`);
      }),
    ]);
  } catch {
    // Cleanup should not mask the proof result.
  }
}
