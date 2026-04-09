import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createFreshCheckout,
  runInFreshCheckout,
} from "./fresh-checkout";

describe("fresh checkout helpers", () => {
  test("clones a local git repository into an isolated working tree", async () => {
    const sourceRoot = createSourceRepo();
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "csh-fresh-clone-"));

    try {
      const checkoutDir = path.join(workspaceRoot, "checkout");
      const result = await createFreshCheckout({
        sourceRepo: sourceRoot,
        checkoutDir,
      });

      expect(result.checkoutDir).toBe(checkoutDir);
      expect(readFileSync(path.join(checkoutDir, "README.md"), "utf8")).toContain("fresh repo");
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("runs a command inside the fresh checkout with extra environment", async () => {
    const sourceRoot = createSourceRepo();
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "csh-fresh-run-"));

    try {
      const checkoutDir = path.join(workspaceRoot, "checkout");
      await createFreshCheckout({
        sourceRepo: sourceRoot,
        checkoutDir,
      });

      const outputFile = path.join(workspaceRoot, "output.txt");
      const result = await runInFreshCheckout({
        checkoutDir,
        command: "bash",
        args: ["-lc", "printf '%s' \"$FRESH_VALUE\" > output.txt"],
        env: {
          FRESH_VALUE: "fresh-ok",
        },
      });

      expect(result.exitCode).toBe(0);
      expect(readFileSync(path.join(checkoutDir, "output.txt"), "utf8")).toBe("fresh-ok");
      expect(outputFile.endsWith("output.txt")).toBe(true);
    } finally {
      rmSync(sourceRoot, { recursive: true, force: true });
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

function createSourceRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "csh-fresh-source-"));
  mkdirSync(path.join(root, ".git"), { recursive: true });
  writeFileSync(path.join(root, "README.md"), "fresh repo\n", "utf8");
  Bun.spawnSync(["git", "init"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync(["git", "config", "user.name", "test"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync(["git", "config", "user.email", "test@example.com"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync(["git", "add", "README.md"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync(["git", "commit", "-m", "init"], { cwd: root, stdout: "ignore", stderr: "ignore" });
  return root;
}
