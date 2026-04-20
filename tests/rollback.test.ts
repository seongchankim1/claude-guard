import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execSync } from "child_process";
import { scan } from "../src/scan.js";
import { renderFindingsMd } from "../src/findings-md.js";
import { applyFixes } from "../src/apply.js";
import { rollback } from "../src/rollback.js";
import { writeFile } from "fs/promises";

describe("rollback", () => {
  it("reverse-applies the saved patch and reports the patch path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-"));
    execSync("git init -q -b main", { cwd: dir });
    execSync("git config user.email a@a && git config user.name a", {
      cwd: dir,
    });
    writeFileSync(join(dir, ".gitignore"), ".claude-guard\n");
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    writeFileSync(
      join(dir, "a.ts"),
      "export const k = process.env.NEXT_PUBLIC_OPENAI_KEY;\n"
    );
    execSync("git add -A && git commit -q -m init", { cwd: dir });

    const s = await scan(dir, { layers: ["l2"] });
    const md = renderFindingsMd(s.scan_id, s.findings).replace(
      /- \[ \]/g,
      "- [x]"
    );
    await writeFile(join(dir, ".claude-guard/findings.md"), md);

    const applied = await applyFixes(dir, { scan_id: s.scan_id });
    expect(existsSync(applied.rollback_path)).toBe(true);

    // After apply, .env should have been mutated away from NEXT_PUBLIC_OPENAI_KEY.
    const envAfterApply = readFileSync(join(dir, ".env"), "utf8");
    expect(envAfterApply).not.toMatch(/^NEXT_PUBLIC_OPENAI_KEY=/m);

    // Real-user flow: commit the staged fixes, then revert when you change
    // your mind. Without the commit, the tree would be dirty and rollback
    // would (correctly) refuse to run.
    execSync(`git commit -q -m 'apply fixes'`, { cwd: dir });

    const r = rollback(dir, s.scan_id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch_path).toBe(applied.rollback_path);

    // After rollback, the original env should be restored.
    const envAfterRollback = readFileSync(join(dir, ".env"), "utf8");
    expect(envAfterRollback).toMatch(/^NEXT_PUBLIC_OPENAI_KEY=/m);
  });

  it("returns ROLLBACK_NOT_FOUND for an unknown scan_id", () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-missing-"));
    const r = rollback(dir, "does-not-exist");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ROLLBACK_NOT_FOUND/);
  });

  it("refuses to apply a placeholder patch (dry_run / no-git artifact)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-placeholder-"));
    const { mkdirSync, writeFileSync } = await import("fs");
    mkdirSync(join(dir, ".git"), { recursive: true });
    mkdirSync(join(dir, ".claude-guard/rollback"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-guard/rollback/abc.patch"),
      "(no diff — dry_run or no git)\n"
    );
    const r = rollback(dir, "abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ROLLBACK_PLACEHOLDER/);
  });

  it("rejects a rollback_id with shell metacharacters", () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-bad-id-"));
    const r = rollback(dir, "abc; touch /tmp/pwned");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ROLLBACK_BAD_ID/);
  });

  it("rejects path-traversal rollback_id", () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-traverse-"));
    const r = rollback(dir, "../../etc/passwd");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ROLLBACK_BAD_ID/);
  });

  it("refuses to apply on a dirty working tree without force", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-dirty-"));
    execSync("git init -q -b main", { cwd: dir });
    execSync("git config user.email a@a && git config user.name a", {
      cwd: dir,
    });
    writeFileSync(join(dir, ".gitignore"), ".claude-guard\n");
    writeFileSync(join(dir, "a.ts"), "export const x = 1;\n");
    execSync("git add -A && git commit -q -m init", { cwd: dir });
    // Build a real patch so it's not the placeholder branch.
    writeFileSync(join(dir, "a.ts"), "export const x = 2;\n");
    const diff = execSync("git diff", { cwd: dir }).toString();
    execSync("git checkout -- a.ts", { cwd: dir });
    const { mkdirSync } = await import("fs");
    mkdirSync(join(dir, ".claude-guard/rollback"), { recursive: true });
    writeFileSync(join(dir, ".claude-guard/rollback/clean.patch"), diff);
    // Dirty the tree with an UNRELATED edit — previous impl would have
    // still run the reverse-apply because `git apply --check` doesn't know
    // about it. The new gate catches it.
    writeFileSync(join(dir, "unrelated.txt"), "unrelated work\n");
    const r = rollback(dir, "clean");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ROLLBACK_DIRTY_TREE/);
  });

  it("refuses to apply when the reverse-apply would conflict (on a clean but divergent tree)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-rollback-conflict-"));
    execSync("git init -q -b main", { cwd: dir });
    execSync("git config user.email a@a && git config user.name a", {
      cwd: dir,
    });
    // Keep .claude-guard out of git so the patch artifact doesn't dirty
    // the tree (in real use it's added to .gitignore on first scan).
    writeFileSync(join(dir, ".gitignore"), ".claude-guard\n");
    writeFileSync(join(dir, "a.ts"), "export const x = 1;\n");
    execSync("git add -A && git commit -q -m init", { cwd: dir });
    // Build a patch that edits a.ts, then revert a.ts AND divergently rewrite
    // it so the reverse-apply can't find its hunk context. Commit the
    // divergent state so the tree is clean but the content differs from
    // what the patch expects.
    writeFileSync(join(dir, "a.ts"), "export const x = 2;\n");
    const diff = execSync("git diff", { cwd: dir }).toString();
    execSync("git checkout -- a.ts", { cwd: dir });
    writeFileSync(join(dir, "a.ts"), "export const completely = 'different';\n");
    execSync("git add -A && git commit -q -m diverge", { cwd: dir });
    const { mkdirSync } = await import("fs");
    mkdirSync(join(dir, ".claude-guard/rollback"), { recursive: true });
    writeFileSync(join(dir, ".claude-guard/rollback/conflict.patch"), diff);
    const r = rollback(dir, "conflict");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/ROLLBACK_WOULD_CONFLICT/);
  });
});
