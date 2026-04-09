import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  startLoggedProcess,
  terminateProcess,
  waitForLogMarker,
  waitForTcpListener,
} from "./host-control";

describe("host control helpers", () => {
  test("starts a logged process and waits for its ready marker", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-host-control-"));
    const logFile = path.join(root, "ready.log");

    const child = await startLoggedProcess("bash", [
      "-lc",
      "printf 'booting\\n'; sleep 0.2; printf 'READY\\n'; sleep 30",
    ], logFile);

    try {
      await waitForLogMarker(logFile, "READY", child.pid, 5_000);
      expect(child.pid).toBeGreaterThan(0);
    } finally {
      await terminateProcess(child.pid);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("times out when the ready marker never appears", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-host-control-"));
    const logFile = path.join(root, "timeout.log");

    const child = await startLoggedProcess("bash", [
      "-lc",
      "printf 'booting\\n'; sleep 30",
    ], logFile);

    try {
      await expect(waitForLogMarker(logFile, "READY", child.pid, 300)).rejects.toThrow(
        /did not become ready/,
      );
    } finally {
      await terminateProcess(child.pid);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("terminates a running process", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "csh-host-control-"));
    const logFile = path.join(root, "terminate.log");

    const child = await startLoggedProcess("bash", [
      "-lc",
      "printf 'READY\\n'; sleep 30",
    ], logFile);

    try {
      await waitForLogMarker(logFile, "READY", child.pid, 5_000);
      await terminateProcess(child.pid);
      await expect(waitForLogMarker(logFile, "still-running", child.pid, 100)).rejects.toThrow(
        /exited before becoming ready/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("waits for a tcp listener to become ready", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = server.address();
      expect(address).not.toBeNull();
      expect(typeof address).toBe("object");
      const port = typeof address === "object" && address ? address.port : 0;
      await waitForTcpListener("127.0.0.1", port, process.pid, 1_000);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
