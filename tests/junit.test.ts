import { describe, it, expect } from "vitest";
import { renderJunitXml } from "../src/junit.js";
import type { Finding } from "../src/types.js";

function mk(sev: Finding["severity"], file: string, line: number): Finding {
  return {
    id: `${file}:${line}`,
    rule_id: "CG-SEC-001",
    severity: sev,
    category: "secrets",
    file,
    range: { startLine: line, startCol: 1, endLine: line, endCol: 2 },
    message: "<dangerous & message>",
    evidence: "X & Y",
    source_engine: "l2",
  };
}

describe("junit xml", () => {
  it("renders an xml document grouped by file", () => {
    const xml = renderJunitXml([
      mk("CRITICAL", "a.ts", 1),
      mk("HIGH", "a.ts", 2),
      mk("HIGH", "b.ts", 5),
    ]);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toMatch(/<testsuite name="a.ts" tests="2"/);
    expect(xml).toMatch(/<testsuite name="b.ts" tests="1"/);
    expect(xml).toMatch(/testsuites name="claude-guard" tests="3"/);
  });

  it("escapes XML-dangerous characters", () => {
    const xml = renderJunitXml([mk("CRITICAL", "a.ts", 1)]);
    expect(xml).not.toContain("<dangerous");
    expect(xml).toContain("&lt;dangerous");
    expect(xml).toContain("&amp;");
  });
});
