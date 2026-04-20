import { describe, it, expect } from "vitest";
import { scorecardToBadge } from "../src/badge.js";
import { scoreFindings } from "../src/scorecard.js";
import type { Finding } from "../src/types.js";

function mk(sev: Finding["severity"], i: number): Finding {
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

describe("badge", () => {
  it("A+ becomes brightgreen on clean scan", () => {
    const b = scorecardToBadge(scoreFindings([]));
    expect(b.schemaVersion).toBe(1);
    expect(b.label).toBe("claude-guard");
    expect(b.message).toMatch(/A\+/);
    expect(b.color).toBe("brightgreen");
  });
  it("F becomes red on critical-heavy scan", () => {
    const many = Array.from({ length: 6 }, (_, i) => mk("CRITICAL", i));
    const b = scorecardToBadge(scoreFindings(many));
    expect(b.message).toMatch(/F/);
    expect(b.color).toBe("red");
  });
});
