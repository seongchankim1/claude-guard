import { describe, it, expect } from "vitest";
import {
  captureBaseline,
  loadBaseline,
  filterAgainstBaseline,
  diffFindings,
  fingerprint,
} from "../src/baseline.js";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

function mk(
  rule_id: string,
  file: string,
  line: number,
  evidence = "E"
): Finding {
  return {
    id: `${rule_id}:${file}:${line}`,
    rule_id,
    severity: "HIGH",
    category: "secrets",
    file,
    range: { startLine: line, startCol: 1, endLine: line, endCol: 2 },
    message: "m",
    evidence,
    source_engine: "l2",
  };
}

describe("baseline", () => {
  it("fingerprints are stable across runs with whitespace noise", () => {
    const a = mk("CG-SEC-001", "a.ts", 1, "NEXT_PUBLIC_OPENAI_KEY=abc");
    const b = mk("CG-SEC-001", "a.ts", 1, "   NEXT_PUBLIC_OPENAI_KEY=abc  ");
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("captures and loads a baseline, then suppresses matching findings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const initial = [mk("CG-SEC-001", "a.ts", 1), mk("CG-XSS-001", "a.tsx", 5)];
    await captureBaseline(dir, "scan-1", initial);
    const baseline = await loadBaseline(dir);
    expect(baseline?.fingerprints).toHaveLength(2);

    const next = [
      ...initial,
      mk("CG-SEC-002", "b.ts", 3, "sk-NEW-FINDING"),
    ];
    const { new_findings, suppressed } = filterAgainstBaseline(next, baseline!);
    expect(suppressed).toBe(2);
    expect(new_findings.map((f) => f.rule_id)).toEqual(["CG-SEC-002"]);
  });

  it("diffFindings reports introduced, resolved, unchanged", () => {
    const before = [
      mk("CG-SEC-001", "a.ts", 1),
      mk("CG-XSS-001", "a.tsx", 5),
    ];
    const after = [
      mk("CG-SEC-001", "a.ts", 1),
      mk("CG-AUTH-001", "b.ts", 9),
    ];
    const d = diffFindings(before, after);
    expect(d.unchanged).toBe(1);
    expect(d.introduced.map((f) => f.rule_id)).toEqual(["CG-AUTH-001"]);
    expect(d.resolved.map((f) => f.rule_id)).toEqual(["CG-XSS-001"]);
  });
});
