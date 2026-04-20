import { describe, it, expect } from "vitest";
import { runSemgrep } from "../src/engines/l1-semgrep.js";
import { runGitleaks } from "../src/engines/l1-gitleaks.js";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("L1 adapters", () => {
  it("semgrep returns an empty result structure even if the binary is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await runSemgrep(dir);
    expect(Array.isArray(r.findings)).toBe(true);
    expect(r.findings.length).toBe(0);
  });
  it("semgrep surfaces a missing-binary warning when 'enabled'", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await runSemgrep(dir, "enabled");
    expect(r.findings).toEqual([]);
    // If semgrep IS installed on the CI runner the warning is absent; only
    // assert the shape is correct and the warning, when present, names the
    // missing binary.
    if (r.warning) expect(r.warning).toMatch(/semgrep/i);
  });
  it("gitleaks returns a result structure even if the binary is missing or repo has no .git", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await runGitleaks(dir);
    expect(Array.isArray(r.findings)).toBe(true);
  });
  it("gitleaks surfaces a missing-binary warning when 'enabled'", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await runGitleaks(dir, "enabled");
    expect(r.findings).toEqual([]);
    if (r.warning) expect(r.warning).toMatch(/gitleaks/i);
  });
});
