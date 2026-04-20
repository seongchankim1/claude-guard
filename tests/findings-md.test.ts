import { describe, it, expect } from "vitest";
import { renderFindingsMd, parseCheckedIds } from "../src/findings-md.js";
import type { Finding } from "../src/types.js";

const sample: Finding = {
  id: "abc123",
  rule_id: "CG-SEC-001",
  severity: "CRITICAL",
  category: "secrets",
  file: "app/env.ts",
  range: { startLine: 12, startCol: 1, endLine: 12, endCol: 30 },
  message: "NEXT_PUBLIC secret",
  evidence: "NEXT_PUBLIC_OPENAI_KEY=sk-x",
  source_engine: "l2",
  fix_strategy: "rename_env_var",
};

describe("findings.md", () => {
  it("renders a checkbox per finding with hidden id", () => {
    const md = renderFindingsMd("scan-1", [sample]);
    expect(md).toContain("<!-- finding_id: abc123 -->");
    expect(md).toContain("- [ ]");
    expect(md).toContain("CG-SEC-001");
    expect(md).toContain("app/env.ts:12");
  });

  it("groups by severity and omits empty groups", () => {
    const md = renderFindingsMd("scan-1", [sample]);
    expect(md).toContain("## CRITICAL (1)");
    expect(md).not.toContain("## LOW");
  });

  it("parses [x] lines and returns ids", () => {
    const md = `- [x] <!-- finding_id: abc123 --> x\n- [ ] <!-- finding_id: def456 --> y`;
    expect(parseCheckedIds(md)).toEqual(["abc123"]);
  });

  it("parses uppercase [X] and multiple checks", () => {
    const md =
      `- [X] <!-- finding_id: a --> x\n- [x] <!-- finding_id: b --> y`;
    expect(parseCheckedIds(md)).toEqual(["a", "b"]);
  });
});
