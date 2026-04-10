#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import {
  closeSession,
  createDirectClient,
  loadEnvFile,
  openSession,
  sleep,
  waitForSnapshot,
  writeSession,
} from "./client-common";
import { runPlaywright } from "./playwright-cli";
import { deriveStateNamespace } from "../src/browser-static/storage";

loadEnvFile();

const browserHost = process.env.CSH_BROWSER_HOST || "127.0.0.1";
const browserPort = process.env.CSH_BROWSER_PORT || "4318";
const relayUrls = (process.env.CVM_RELAYS || process.env.CSH_NOSTR_RELAY_URLS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const serverPubkey = (process.env.CVM_SERVER_PUBKEY || process.env.CSH_SERVER_PUBKEY || "").trim();
const ageMs = Number.parseInt(process.env.CSH_AGED_BROWSER_ATTACH_MS ?? "6000", 10);
const sessionId =
  process.env.CSH_AGED_BROWSER_SESSION_ID ?? `csh-aged-browser-${Date.now()}-${process.pid}`;
const baseUrl = `http://${browserHost}:${browserPort}`;
const playwrightSession = `csh-aged-browser-${Date.now()}-${randomUUID()}`;

const directClient = await createDirectClient("csh-aged-browser");

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
    const opened = await openSession(directClient, { sessionId });
    await writeSession(directClient, opened.sessionId, "cd /tmp\nprintf '__AGE__%s\\n' \"$PWD\"\n");
    await waitForSnapshot(
      directClient,
      opened.sessionId,
      (snapshot) => snapshot.includes("__AGE__/tmp"),
      { cursor: opened.cursor },
    );
    await sleep(ageMs);

    const stateNamespace = deriveStateNamespace({
      relayUrls,
      serverPubkey,
    });

    await runPlaywright(["open", baseUrl], { session: playwrightSession });
    await runPlaywright(["snapshot"], { session: playwrightSession });
    await runPlaywright(
      [
        "run-code",
        `async page => {
          await page.evaluate(() => {
            localStorage.setItem(
              "csh.browser-static.sessionId.${stateNamespace}",
              ${JSON.stringify(opened.sessionId)},
            );
          });
          await page.reload();
          await page.waitForFunction(() => Boolean(document.querySelector("[data-action='connect']")));
        }`,
      ],
      { session: playwrightSession },
    );
    await runPlaywright(
      [
        "run-code",
        `async page => {
          await page.locator("[data-action='connect']").click();
          await page.waitForFunction(() => {
            const status = document.querySelector("[data-status]")?.textContent || "";
            const actor = document.querySelector("[data-actor]")?.textContent || "";
            const session = document.querySelector("[data-session]")?.textContent || "";
            return status.startsWith("Error:") || (actor !== "pending" && session === ${JSON.stringify(opened.sessionId)});
          }, undefined, { timeout: 20000 });
          const status = await page.evaluate(() => document.querySelector("[data-status]")?.textContent || "");
          if (status.startsWith("Error:")) {
            throw new Error(status);
          }
        }`,
      ],
      { session: playwrightSession },
    );
    await runPlaywright(
      [
        "run-code",
        `async page => {
          await page.evaluate(() => {
            const input = document.querySelector("[data-terminal-input]");
            if (!(input instanceof HTMLTextAreaElement)) {
              throw new Error("terminal input capture was not found");
            }
            input.value = "printf '__BROWSER_ATTACH__%s\\\\n' \\\"$PWD\\\"\\n";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });
        }`,
      ],
      { session: playwrightSession },
    );

    const polled = await waitForSnapshot(
      directClient,
      opened.sessionId,
      (snapshot) => snapshot.includes("__BROWSER_ATTACH__/tmp"),
      { cursor: 0 },
    );
    const output = JSON.stringify(polled);
    if (!output.includes("__BROWSER_ATTACH__/tmp")) {
      throw new Error(`Static aged browser attach did not observe expected output for session ${opened.sessionId}`);
    }

    console.log(
      JSON.stringify(
        {
          browserUrl: baseUrl,
          sessionId: opened.sessionId,
          ageMs,
          output,
        },
        null,
        2,
      ),
    );
  } finally {
    await ignoreCleanupTimeout(() => closeSession(directClient, sessionId));
    await ignoreCleanupTimeout(() => directClient.close());
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
