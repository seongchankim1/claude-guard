import { describe, it, expect } from "vitest";
import { renderHtmlReport } from "../src/html-report.js";
import type { Finding } from "../src/types.js";

function mk(sev: Finding["severity"], id: string): Finding {
  return {
    id: `id-${id}`,
    rule_id: id,
    severity: sev,
    category: "secrets",
    file: "app/env.ts",
    range: { startLine: 1, startCol: 1, endLine: 1, endCol: 2 },
    message: "a <script> and & entity",
    evidence: "<dangerous>",
    source_engine: "l2",
  };
}

describe("html report", () => {
  it("produces standalone HTML with escaped content", () => {
    const html = renderHtmlReport("abcdef12", [mk("CRITICAL", "CG-SEC-001")]);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("CG-SEC-001");
    expect(html).toContain("&lt;dangerous&gt;");
    expect(html).not.toContain("<script>");
  });

  it("shows A+ grade when no findings", () => {
    const html = renderHtmlReport("deadbeef", []);
    expect(html).toContain("A+");
  });
});
