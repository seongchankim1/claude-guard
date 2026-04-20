import { describe, it, expect } from "vitest";
import { filterIgnored } from "../src/ignore.js";
import type { Finding } from "../src/types.js";

function f(
  rule_id: string,
  file: string,
  line = 1,
  severity: Finding["severity"] = "HIGH"
): Finding {
  return {
    id: `${rule_id}:${file}:${line}`,
    rule_id,
    severity,
    category: "other",
    file,
    range: { startLine: line, startCol: 1, endLine: line, endCol: 2 },
    message: "m",
    evidence: "e",
    source_engine: "l2",
  };
}

describe("ignore", () => {
  it("drops entries matching rule_id + file + line", () => {
    const findings = [
      f("CG-SEC-001", "a.ts", 3),
      f("CG-SEC-001", "b.ts", 3),
    ];
    const out = filterIgnored(findings, [
      { rule_id: "CG-SEC-001", file: "a.ts", line: 3 },
    ]);
    expect(out.map((x) => x.file)).toEqual(["b.ts"]);
  });

  it("drops all findings of a rule when only rule_id is given", () => {
    const findings = [
      f("CG-SEC-001", "a.ts", 3),
      f("CG-SEC-002", "a.ts", 3),
    ];
    const out = filterIgnored(findings, [{ rule_id: "CG-SEC-001" }]);
    expect(out.map((x) => x.rule_id)).toEqual(["CG-SEC-002"]);
  });

  it("supports wildcard rule_id", () => {
    const findings = [f("CG-SEC-001", "a.ts"), f("CG-AUTH-001", "a.ts")];
    const out = filterIgnored(findings, [{ rule_id: "CG-SEC-*" }]);
    expect(out.map((x) => x.rule_id)).toEqual(["CG-AUTH-001"]);
  });

  it("supports directory prefix for file (trailing slash)", () => {
    const findings = [
      f("CG-SEC-001", "app/api/users/route.ts"),
      f("CG-SEC-001", "lib/x.ts"),
    ];
    const out = filterIgnored(findings, [{ file: "app/api/" }]);
    expect(out.map((x) => x.file)).toEqual(["lib/x.ts"]);
  });

  it("no-op when ignore list is empty", () => {
    const findings = [f("CG-SEC-001", "a.ts")];
    expect(filterIgnored(findings, [])).toEqual(findings);
  });
});
