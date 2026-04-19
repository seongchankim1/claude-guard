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
