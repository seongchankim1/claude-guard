import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { changedFiles } from "../src/diff.js";

// Regression: --diff used to silently swallow `git diff base...HEAD` failures
// and return zero files, producing a "clean" scan that skipped every change.
// That's a critical false negative for a security scanner.
describe("changedFiles fails loud on bad input", () => {
  it("throws DIFF_BAD_BASE when the base ref does not resolve", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-diff-bad-base-"));
    execSync("git init -q -b main", { cwd: dir });
    execSync("git config user.email a@a && git config user.name a", {
      cwd: dir,
    });
    writeFileSync(join(dir, "a.ts"), "export {}\n");
    execSync("git add -A && git commit -q -m init", { cwd: dir });

    await expect(
      changedFiles(dir, "origin/does-not-exist")
    ).rejects.toThrow(/DIFF_BAD_BASE/);
  });

  it("throws DIFF_NO_GIT outside a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-diff-no-git-"));
    await expect(changedFiles(dir, "main")).rejects.toThrow(/DIFF_NO_GIT/);
  });
});
