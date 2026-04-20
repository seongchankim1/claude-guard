import { describe, it, expect } from "vitest";
import { scoreFindings, renderScorecardMd } from "../src/scorecard.js";
import type { Finding, Severity } from "../src/types.js";

function mk(sev: Severity, i: number): Finding {
  return {
    id: `${sev}-${i}`,
    rule_id: "CG-X-001",
    severity: sev,
    category: "secrets",
    file: "a.ts",
    range: { startLine: 1, startCol: 1, endLine: 1, endCol: 2 },
    message: "m",
    evidence: "e",
    source_engine: "l2",
  };
}

describe("scorecard", () => {
  it("gives A+ on empty findings", () => {
    const c = scoreFindings([]);
    expect(c.score).toBe(100);
    expect(c.grade).toBe("A+");
  });
  it("deducts for a single critical", () => {
    const c = scoreFindings([mk("CRITICAL", 1)]);
    expect(c.score).toBe(80);
    expect(c.deductions.CRITICAL).toBe(20);
    expect(["C", "D"]).toContain(c.grade);
  });
  it("caps deductions per severity", () => {
    const many = Array.from({ length: 20 }, (_, i) => mk("LOW", i));
    const c = scoreFindings(many);
    expect(c.deductions.LOW).toBe(10);
    expect(c.score).toBe(90);
  });
  it("headline lists all non-zero severities", () => {
    const c = scoreFindings([mk("CRITICAL", 1), mk("HIGH", 1), mk("LOW", 1)]);
    expect(c.headline).toContain("1 CRITICAL");
    expect(c.headline).toContain("1 HIGH");
    expect(c.headline).toContain("1 LOW");
    expect(c.headline).not.toContain("MEDIUM");
  });
  it("renders markdown table", () => {
    const c = scoreFindings([mk("HIGH", 1), mk("HIGH", 2)]);
    const md = renderScorecardMd(c);
    expect(md).toContain("Security scorecard");
    expect(md).toContain("HIGH");
    expect(md).toContain("-16");
  });
});
