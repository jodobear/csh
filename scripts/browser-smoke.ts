#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { closeSession, createDirectClient, loadEnvFile, waitForSnapshot } from "./client-common";
import {
  parsePlaywrightPageUrl,
  parsePlaywrightResult,
  runPlaywright,
} from "./playwright-cli";

loadEnvFile();

const browserHost = process.env.CSH_BROWSER_HOST || "127.0.0.1";
const browserPort = process.env.CSH_BROWSER_PORT || "4318";
const baseUrl = `http://${browserHost}:${browserPort}`;
const session = `csh-browser-static-${Date.now()}-${randomUUID()}`;
const directClient = await createDirectClient("csh-browser-smoke");
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
    await runPlaywright(["open", baseUrl], { session });
    await runPlaywright(["snapshot"], { session });
    const connectReady = await runPlaywright(
      [
        "run-code",
        `async page => {
          await page.waitForFunction(
            () => Boolean(document.querySelector("[data-action='connect']")),
            undefined,
            { timeout: 20000 },
          );
          return page.url();
        }`,
      ],
      { session },
    );
    const initialPageUrl = parsePlaywrightPageUrl(connectReady);
    if (initialPageUrl && initialPageUrl.startsWith("chrome-error://")) {
      throw new Error(`Static browser smoke loaded an error page instead of ${baseUrl}`);
    }
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
            input.value = "printf '__BROWSER_STATIC__%s\\\\n' \\\"$PWD\\\"\\n";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });
        }`,
      ],
      { session },
    );
    const actor = parsePlaywrightResult<string>(
      await runPlaywright(["eval", `document.querySelector("[data-actor]")?.textContent || ""`], { session }),
    );
    sessionId = parsePlaywrightResult<string>(
      await runPlaywright(["eval", `document.querySelector("[data-session]")?.textContent || ""`], { session }),
    );
    const polled = await waitForSnapshot(
      directClient,
      sessionId,
      (snapshot) => snapshot.includes("__BROWSER_STATIC__/"),
      { cursor: 0 },
    );
    const output = JSON.stringify(polled);
    if (!output.includes("__BROWSER_STATIC__/")) {
      throw new Error(`Static browser smoke did not observe expected output for session ${sessionId}`);
    }

    await runPlaywright(
      [
        "run-code",
        `async page => {
          await page.locator("[data-action='close']").click();
          await page.waitForFunction(() => {
            const status = document.querySelector("[data-status]")?.textContent || "";
            return status.includes("Session closed") || status.includes("Remote session closed");
          }, undefined, { timeout: 20000 });
        }`,
      ],
      { session },
    );

    console.log(
      JSON.stringify(
        {
          browserUrl: baseUrl,
          actor,
          sessionId,
          output,
        },
        null,
        2,
      ),
    );
  } finally {
    if (sessionId) {
      await ignoreCleanupTimeout(() => closeSession(directClient, sessionId));
    }
    await ignoreCleanupTimeout(() => directClient.close());
    await ignoreCleanupTimeout(() => runPlaywright(["close"], { session }));
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
