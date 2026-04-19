import { describe, it, expect } from "vitest";
import { runL2 } from "../src/engines/l2-native.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadBuiltinRules } from "../src/rules/loader.js";

describe("L2 scanner", () => {
  it("detects NEXT_PUBLIC secret in .env", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, ".env"), "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n");
    const rules = await loadBuiltinRules();
    const findings = await runL2(dir, rules);
    expect(findings.some((f) => f.rule_id === "CG-SEC-001")).toBe(true);
  });

  it("detects prisma $queryRawUnsafe", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, "app"));
    writeFileSync(join(dir, "app/route.ts"), "await prisma.$queryRawUnsafe(q);\n");
    const rules = await loadBuiltinRules();
    const findings = await runL2(dir, rules);
    expect(findings.some((f) => f.rule_id === "CG-SQL-002")).toBe(true);
  });

  it("detects dangerouslySetInnerHTML with dynamic expression", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "a.tsx"),
      'export const X = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;\n'
    );
    const rules = await loadBuiltinRules();
    const findings = await runL2(dir, rules);
    expect(findings.some((f) => f.rule_id === "CG-XSS-001")).toBe(true);
  });

  it("returns no findings on clean code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, "safe.ts"), "export const x = 1;\n");
    const rules = await loadBuiltinRules();
    const findings = await runL2(dir, rules);
    expect(findings).toEqual([]);
  });

  it("dedupes identical findings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    const rules = await loadBuiltinRules();
    const findings = await runL2(dir, rules);
    const key = findings
      .filter((f) => f.rule_id === "CG-SEC-001")
      .map((f) => `${f.file}:${f.range.startLine}`);
    expect(new Set(key).size).toBe(key.length);
  });
});
