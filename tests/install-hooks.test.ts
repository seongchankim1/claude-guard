import { describe, it, expect } from "vitest";
import { installGitHook } from "../src/install-hooks.js";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("install-hooks", () => {
  it("fails cleanly when no .git dir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await installGitHook(dir);
    expect(r.wrote).toBe(false);
    expect(r.reason).toMatch(/not a git repo/);
  });

  it("installs a fresh pre-commit hook", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    const r = await installGitHook(dir);
    expect(r.wrote).toBe(true);
    const content = readFileSync(r.path, "utf8");
    expect(content).toContain("claude-guard pre-commit");
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
    const mode = statSync(r.path).mode & 0o777;
    expect(mode & 0o100).toBe(0o100); // owner-executable
  });

  it("is idempotent — second install is a no-op", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    await installGitHook(dir);
    const r2 = await installGitHook(dir);
    expect(r2.wrote).toBe(false);
    expect(r2.reason).toMatch(/already installed/);
  });

  it("chains before an existing non-claude-guard hook", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    const existing = "#!/usr/bin/env bash\nexit 0\n";
    writeFileSync(join(dir, ".git/hooks/pre-commit"), existing);
    const r = await installGitHook(dir);
    expect(r.wrote).toBe(true);
    const content = readFileSync(r.path, "utf8");
    expect(content).toContain("claude-guard pre-commit");
    expect(content).toContain("existing hook preserved");
  });

  it("second install on chained hook is a no-op", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, ".git", "hooks"), { recursive: true });
    writeFileSync(join(dir, ".git/hooks/pre-commit"), "#!/usr/bin/env bash\nexit 0\n");
    await installGitHook(dir);
    const r = await installGitHook(dir);
    expect(r.wrote).toBe(false);
    expect(existsSync(r.path)).toBe(true);
  });
});
