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
import { writeFile } from "fs/promises";

function initGit(dir: string): void {
  execSync("git init -q -b main", { cwd: dir });
  execSync("git config user.email a@a", { cwd: dir });
  execSync("git config user.name a", { cwd: dir });
}

function seedGitRepo(dir: string): void {
  initGit(dir);
  writeFileSync(join(dir, ".gitignore"), ".claude-guard\n");
}

describe("apply_fixes", () => {
  it("applies only checked items, creates a branch and a rollback patch", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    seedGitRepo(dir);
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

    const res = await applyFixes(dir, { scan_id: s.scan_id });
    expect(res.applied.length + res.suggested.length).toBeGreaterThan(0);
    expect(existsSync(res.rollback_path)).toBe(true);
    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toContain("OPENAI_KEY=sk-");
  });

  it("skips everything when nothing is checked", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    seedGitRepo(dir);
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    execSync("git add -A && git commit -q -m init", { cwd: dir });
    const s = await scan(dir, { layers: ["l2"] });
    const md = renderFindingsMd(s.scan_id, s.findings);
    await writeFile(join(dir, ".claude-guard/findings.md"), md);
    const res = await applyFixes(dir, { scan_id: s.scan_id });
    expect(res.applied).toEqual([]);
    expect(res.suggested).toEqual([]);
  });

  it("all_safe mode includes every AST-backed strategy (not just rename_env_var)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    seedGitRepo(dir);
    // Seed two different AST-fixable findings in the same tree:
    //   CG-SEC-001  -> rename_env_var
    //   CG-AUTH-002 -> set_cookie_flags
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    writeFileSync(
      join(dir, "session.ts"),
      [
        "import { cookies } from 'next/headers';",
        "export function login() {",
        "  cookies().set({ name: 'sid', value: 'abc' });",
        "}",
      ].join("\n") + "\n"
    );
    execSync("git add -A && git commit -q -m init", { cwd: dir });
    const s = await scan(dir, { layers: ["l2"] });
    // Sanity: both rules should have fired.
    const ruleIds = new Set(s.findings.map((f) => f.rule_id));
    expect(ruleIds.has("CG-SEC-001")).toBe(true);
    expect(ruleIds.has("CG-AUTH-002")).toBe(true);

    const res = await applyFixes(dir, { scan_id: s.scan_id, mode: "all_safe" });
    // Both rename_env_var AND set_cookie_flags should have been applied,
    // not just the env rename (which was the pre-fix bug).
    const touched = s.findings
      .filter((f) => res.applied.includes(f.id))
      .map((f) => f.rule_id);
    expect(touched).toContain("CG-SEC-001");
    expect(touched).toContain("CG-AUTH-002");
  });

  it("refuses to reuse an existing claude-guard/fix-<id> branch without force", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-fix-branch-"));
    seedGitRepo(dir);
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    execSync("git add -A && git commit -q -m init", { cwd: dir });
    const s = await scan(dir, { layers: ["l2"] });
    // Pre-create the branch the next apply_fixes run will want.
    execSync(`git branch claude-guard/fix-${s.scan_id.slice(0, 8)}`, {
      cwd: dir,
    });
    await expect(
      applyFixes(dir, { scan_id: s.scan_id })
    ).rejects.toThrow(/FIX_BRANCH_EXISTS/);
  });

  it("refuses dirty working tree without force", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    seedGitRepo(dir);
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    execSync("git add -A && git commit -q -m init", { cwd: dir });
    const s = await scan(dir, { layers: ["l2"] });
    writeFileSync(join(dir, "dirty.txt"), "dirty\n");
    await expect(
      applyFixes(dir, { scan_id: s.scan_id })
    ).rejects.toThrow(/WORKING_TREE_DIRTY/);
  });
});
