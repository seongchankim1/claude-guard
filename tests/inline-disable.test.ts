import { describe, it, expect } from "vitest";
import { filterByInlineDisables } from "../src/inline-disable.js";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

function mk(
  file: string,
  line: number,
  rule_id = "CG-SEC-001"
): Finding {
  return {
    id: `${file}:${line}:${rule_id}`,
    rule_id,
    severity: "CRITICAL",
    category: "secrets",
    file,
    range: { startLine: line, startCol: 1, endLine: line, endCol: 2 },
    message: "m",
    evidence: "e",
    source_engine: "l2",
  };
}

describe("inline disable", () => {
  it("disable-next-line suppresses the following line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "a.ts"),
      "// claude-guard-disable-next-line CG-SEC-001\nconst NEXT_PUBLIC_OPENAI_KEY = 'x';\n"
    );
    const out = await filterByInlineDisables(dir, [mk("a.ts", 2)]);
    expect(out).toEqual([]);
  });

  it("disable-next-line with no id suppresses all rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "a.ts"),
      "// claude-guard-disable-next-line\nconst X = 'x';\n"
    );
    const out = await filterByInlineDisables(dir, [
      mk("a.ts", 2, "CG-SEC-001"),
      mk("a.ts", 2, "CG-XSS-001"),
    ]);
    expect(out).toEqual([]);
  });

  it("disable-file kills everything in that file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "a.ts"),
      "// claude-guard-disable-file\nconst X = 'x';\nconst Y = 'y';\n"
    );
    const out = await filterByInlineDisables(dir, [
      mk("a.ts", 2, "CG-SEC-001"),
      mk("a.ts", 3, "CG-XSS-001"),
    ]);
    expect(out).toEqual([]);
  });

  it("disable-file with specific id leaves unrelated rules", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "a.ts"),
      "// claude-guard-disable-file CG-SEC-001\nconst X = 'x';\n"
    );
    const keep = mk("a.ts", 2, "CG-XSS-001");
    const out = await filterByInlineDisables(dir, [
      mk("a.ts", 2, "CG-SEC-001"),
      keep,
    ]);
    expect(out).toEqual([keep]);
  });

  it("disable-line suppresses the same line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "a.ts"),
      "const X = 'x'; // claude-guard-disable-line CG-SEC-001\n"
    );
    const out = await filterByInlineDisables(dir, [mk("a.ts", 1)]);
    expect(out).toEqual([]);
  });
});
