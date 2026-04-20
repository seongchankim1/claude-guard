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
});
