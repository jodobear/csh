#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";

import { closeSession, createDirectClient, loadEnvFile, waitForSnapshot } from "./client-common";
import { defaultEnvFile, parseEnvFile, repoRoot } from "./config";
import { parsePlaywrightResult, runPlaywright } from "./playwright-cli";
import { startLoggedProcess, terminateProcess, waitForLogMarker, waitForTcpListener } from "./host-control";

const envFile = path.resolve(process.argv[2] ?? process.env.CVM_ENV_FILE ?? defaultEnvFile());
loadEnvFile(envFile);
const values = parseEnvFile(envFile);
const basePort = Number.parseInt(process.env.CSH_STATIC_BROWSER_PORT || process.env.CSH_BROWSER_PORT || values.CSH_BROWSER_PORT || "43381", 10);
const browserPort = await pickFreeLoopbackPort(basePort);
const logFile = process.env.CSH_STATIC_BROWSER_LOG || path.join(repoRoot(), ".csh-runtime", "logs", "static-browser-smoke.log");
const playwrightSession = `csh-static-dist-${Date.now()}-${randomUUID()}`;
const relayUrls = (process.env.CSH_BROWSER_RELAY_URLS || process.env.CVM_RELAYS || values.CVM_RELAYS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const serverPubkey = (process.env.CSH_BROWSER_SERVER_PUBKEY || process.env.CVM_SERVER_PUBKEY || values.CVM_SERVER_PUBKEY || "").trim();
const baseUrl = `http://127.0.0.1:${browserPort}`;
const directClient = await createDirectClient("csh-static-browser-smoke");
let serverPid: number | null = null;
let sessionId: string | null = null;

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
          CSH_BROWSER_TEST_SIGNER_PRIVATE_KEY: values.CVM_CLIENT_PRIVATE_KEY,
          CSH_BROWSER_RELAY_URLS: relayUrls.join(","),
          CSH_BROWSER_SERVER_PUBKEY: serverPubkey,
        },
      },
    );
    serverPid = browser.pid;
    await waitForLogMarker(logFile, "csh static browser dist listening on", browser.pid, 30_000);
    await waitForTcpListener("127.0.0.1", browserPort, browser.pid, 30_000);

    await runPlaywright(["open", baseUrl], { session: playwrightSession });
    await runPlaywright(
      [
        "run-code",
        `async page => {
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
            input.value = "printf '__STATIC_DIST__%s\\\\n' \\\"$PWD\\\"\\n";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });
        }`,
      ],
      { session: playwrightSession },
    );
    sessionId = parsePlaywrightResult<string>(
      await runPlaywright(["eval", `document.querySelector("[data-session]")?.textContent || ""`], { session: playwrightSession }),
    );
    const polled = await waitForSnapshot(
      directClient,
      sessionId,
      (snapshot) => snapshot.includes("__STATIC_DIST__/"),
      { cursor: 0 },
    );
    const output = JSON.stringify(polled);
    if (!output.includes("__STATIC_DIST__/")) {
      throw new Error(`Static dist smoke did not observe expected output for session ${sessionId}`);
    }
    console.log(JSON.stringify({ browserUrl: baseUrl, sessionId, output }, null, 2));
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

async function pickFreeLoopbackPort(start = 43381, count = 200): Promise<number> {
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
