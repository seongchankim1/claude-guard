import { describe, it, expect } from "vitest";
import { ensureWorkspace, ensureGitignore } from "../src/workspace.js";
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("workspace", () => {
  it("creates .claude-guard subdirs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    await ensureWorkspace(dir);
    expect(existsSync(join(dir, ".claude-guard/scans"))).toBe(true);
    expect(existsSync(join(dir, ".claude-guard/reports"))).toBe(true);
    expect(existsSync(join(dir, ".claude-guard/rollback"))).toBe(true);
    expect(existsSync(join(dir, ".claude-guard/redteam"))).toBe(true);
  });
  it("adds .claude-guard to gitignore", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, ".gitignore"), "node_modules\n");
    await ensureGitignore(dir);
    const content = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(content).toContain(".claude-guard");
  });
  it("is idempotent for gitignore", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, ".gitignore"), ".claude-guard\n");
    await ensureGitignore(dir);
    const content = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(content.match(/\.claude-guard/g)?.length).toBe(1);
  });
  it("creates gitignore when missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    await ensureGitignore(dir);
    expect(existsSync(join(dir, ".gitignore"))).toBe(true);
  });
});
