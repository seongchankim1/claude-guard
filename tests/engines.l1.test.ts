import { describe, it, expect } from "vitest";
import { runSemgrep } from "../src/engines/l1-semgrep.js";
import { runGitleaks } from "../src/engines/l1-gitleaks.js";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("L1 adapters", () => {
  it("semgrep returns an array even if the binary is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const f = await runSemgrep(dir);
    expect(Array.isArray(f)).toBe(true);
  });
  it("gitleaks returns an array even if the binary is missing or repo has no .git", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const f = await runGitleaks(dir);
    expect(Array.isArray(f)).toBe(true);
  });
});
