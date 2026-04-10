#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";

import { closeSession, createDirectClient, loadEnvFile, waitForSnapshot } from "./client-common";
import { requireConnectedBrowserState } from "./browser-proof-state";
import { defaultEnvFile, repoRoot } from "./config";
import { startLoggedProcess, terminateProcess, waitForLogMarker, waitForTcpListener } from "./host-control";
import { parsePlaywrightResult, runPlaywright } from "./playwright-cli";
import { exportProfile } from "./profile-cli";

const envFile = path.resolve(process.argv[2] ?? process.env.CVM_ENV_FILE ?? defaultEnvFile());
loadEnvFile(envFile);

const basePort = Number.parseInt(process.env.CSH_PROFILE_BROWSER_PORT || process.env.CSH_BROWSER_PORT || "43382", 10);
const browserPort = await pickFreeLoopbackPort(basePort);
const logFile = process.env.CSH_PROFILE_BROWSER_LOG || path.join(repoRoot(), ".csh-runtime", "logs", "profile-browser-smoke.log");
const playwrightSession = `csh-profile-browser-${Date.now()}-${randomUUID()}`;
const baseUrl = `http://127.0.0.1:${browserPort}`;
const profile = await exportProfile(envFile, {
  label: "Private Relay",
  env: process.env,
  preferredSignerKind: "test",
});
const directClient = await createDirectClient("csh-profile-browser-smoke");
let serverPid: number | null = null;
let sessionId: string | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

await main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  try {
    await buildTestBundle();
    const browser = await startLoggedProcess(
      "bun",
      ["run", "scripts/serve-static-browser.ts"],
      logFile,
      {
        cwd: repoRoot(),
        env: {
          BUN_TMPDIR: "/tmp",
          BUN_INSTALL: "/tmp/bun-install",
          CSH_BROWSER_PORT: String(browserPort),
          CSH_BROWSER_DEFAULT_SIGNER: "test",
          CSH_BROWSER_TEST_SIGNER_PRIVATE_KEY: process.env.CVM_CLIENT_PRIVATE_KEY,
        },
      },
    );
    serverPid = browser.pid;
    await waitForLogMarker(logFile, "csh static browser dist listening on", browser.pid, 30_000);
    await waitForTcpListener("127.0.0.1", browserPort, browser.pid, 30_000);

    await runPlaywright(["open", baseUrl], { session: playwrightSession });
    const preloadedState = parsePlaywrightResult<{
      relayValue: string;
      serverValue: string;
      signerValue: string;
    }>(
      await runPlaywright(
        [
          "run-code",
          `async page => {
            await page.evaluate((input) => {
              window.localStorage.removeItem("csh.browser-static.settings.v1");
              window.localStorage.setItem(
                "csh.browser-static.profiles.v1",
                input.profilesJson,
              );
              window.localStorage.setItem(
                "csh.browser-static.selected-profile.v1",
                input.selectedProfileLabel,
              );
            }, {
              profilesJson: ${JSON.stringify(JSON.stringify([profile]))},
              selectedProfileLabel: ${JSON.stringify(profile.label)},
            });
            await page.reload({ waitUntil: "networkidle" });
            await page.waitForTimeout(250);
            return await page.evaluate(() => ({
              relayValue: document.querySelector("[data-field='relays']")?.value ?? "",
              serverValue: document.querySelector("[data-field='server-pubkey']")?.value ?? "",
              signerValue: document.querySelector("[data-field='signer']")?.value ?? "",
            }));
          }`,
        ],
        { session: playwrightSession },
      ),
    );
    assert(preloadedState.relayValue.includes("ws://"), `Saved profile did not load relay URLs: ${JSON.stringify(preloadedState)}`);
    assert(preloadedState.serverValue.length === 64, `Saved profile did not load the server pubkey: ${JSON.stringify(preloadedState)}`);
    assert(preloadedState.signerValue === "test", `Saved profile did not load the test signer: ${JSON.stringify(preloadedState)}`);

    const browserState = requireConnectedBrowserState(
      parsePlaywrightResult<{ status: string; actor: string; session: string }>(
        await runPlaywright(
          [
            "run-code",
            `async page => {
              await page.locator("[data-action='connect']").click();
              let state = {
                status: "",
                actor: "",
                session: "",
              };
              const deadline = Date.now() + 20000;
              while (Date.now() < deadline) {
                state = await page.evaluate(() => ({
                  status: document.querySelector("[data-status]")?.textContent || "",
                  actor: document.querySelector("[data-actor]")?.textContent || "",
                  session: document.querySelector("[data-session]")?.textContent || "",
                }));
                if (state.status.startsWith("Error:") || (state.actor !== "pending" && state.session !== "pending" && state.session !== "closed")) {
                  break;
                }
                await page.waitForTimeout(250);
              }
              await page.evaluate(() => {
                const input = document.querySelector("[data-terminal-input]");
                if (!(input instanceof HTMLTextAreaElement)) {
                  throw new Error("terminal input capture was not found");
                }
                input.value = "printf '__PROFILE__%s\\\\n' \\\"$PWD\\\"\\n";
                input.dispatchEvent(new Event("input", { bubbles: true }));
              });
              return state;
            }`,
          ],
          { session: playwrightSession },
        ),
      ),
    );
    sessionId = browserState.session;
    const polled = await waitForSnapshot(
      directClient,
      sessionId,
      (snapshot) => snapshot.includes("__PROFILE__/"),
      { cursor: 0 },
    );
    const output = JSON.stringify(polled);
    if (!output.includes("__PROFILE__/")) {
      throw new Error(`Profile browser smoke did not observe expected output for session ${sessionId}`);
    }

    console.log(JSON.stringify({ browserUrl: baseUrl, sessionId, profileLabel: profile.label, output }, null, 2));
  } finally {
    if (sessionId) {
      await ignoreCleanupTimeout(() => closeSession(directClient, sessionId));
    }
    await ignoreCleanupTimeout(() => directClient.close());
    if (serverPid !== null) {
      await ignoreCleanupTimeout(() => terminateProcess(serverPid));
    }
    await ignoreCleanupTimeout(() => runPlaywright(["close"], { session: playwrightSession }));
  }
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

async function buildTestBundle(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["run", "scripts/build-browser-assets.ts"], {
      cwd: repoRoot(),
      env: {
        ...process.env,
        BUN_TMPDIR: "/tmp",
        BUN_INSTALL: "/tmp/bun-install",
        CSH_BUILD_BROWSER_ENABLE_TEST_SIGNER: "1",
      },
      stdio: "ignore",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Failed to build test browser bundle (exit ${code ?? 1})`));
    });
  });
}

async function pickFreeLoopbackPort(start = 43382, count = 200): Promise<number> {
  for (let port = start; port < start + count; port += 1) {
    const candidate = await Bun.$`bash -lc ${`! ss -ltn 2>/dev/null | grep -q ':${port} '`}`.quiet().nothrow();
    if (candidate.exitCode === 0) {
      return port;
    }
  }
  throw new Error(`Could not find a free loopback port in range ${start}-${start + count - 1}`);
}
