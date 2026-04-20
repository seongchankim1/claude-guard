import { describe, it, expect } from "vitest";
import { findingsToSarif } from "../src/sarif.js";
import { loadBuiltinRules } from "../src/rules/loader.js";
import type { Finding } from "../src/types.js";

function mk(id: string, sev: Finding["severity"]): Finding {
  return {
    id: `f-${id}`,
    rule_id: id,
    severity: sev,
    category: "secrets",
    file: "app/env.ts",
    range: { startLine: 4, startCol: 1, endLine: 4, endCol: 20 },
    message: "test finding",
    evidence: "NEXT_PUBLIC_OPENAI_KEY=sk-x",
    source_engine: "l2",
  };
}

describe("sarif export", () => {
  it("produces a valid 2.1.0 document shape", async () => {
    const rules = await loadBuiltinRules();
    const findings = [mk("CG-SEC-001", "CRITICAL"), mk("CG-XSS-001", "HIGH")];
    const sarif = findingsToSarif(findings, rules);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-schema-2.1.0");
    expect(sarif.runs).toHaveLength(1);
    const run = sarif.runs[0];
    expect(run.tool.driver.name).toBe("claude-guard");
    expect(run.tool.driver.rules.map((r) => r.id)).toEqual(
      expect.arrayContaining(["CG-SEC-001", "CG-XSS-001"])
    );
    expect(run.results).toHaveLength(2);
  });

  it("maps CRITICAL/HIGH to 'error', MEDIUM to 'warning', LOW to 'note'", async () => {
    const rules = await loadBuiltinRules();
    const findings = [
      mk("CG-SEC-001", "CRITICAL"),
      mk("CG-XSS-001", "HIGH"),
      mk("CG-CFG-005", "MEDIUM"),
      mk("CG-CFG-001", "LOW"),
    ];
    const sarif = findingsToSarif(findings, rules);
    const levels = sarif.runs[0].results.map((r) => r.level);
    expect(levels).toEqual(["error", "error", "warning", "note"]);
  });

  it("generates a rule stub for unknown rule ids (e.g. Semgrep)", async () => {
    const rules = await loadBuiltinRules();
    const findings = [
      {
        ...mk("CG-SEC-001", "CRITICAL"),
        rule_id: "semgrep.p.some-external-rule",
        source_engine: "semgrep" as const,
      },
    ];
    const sarif = findingsToSarif(findings, rules);
    const ids = sarif.runs[0].tool.driver.rules.map((r) => r.id);
    expect(ids).toContain("semgrep.p.some-external-rule");
  });
});
