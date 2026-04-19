import { describe, it, expect } from "vitest";
import { applyFix } from "../src/fix/index.js";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

describe("fix strategies", () => {
  it("rename_env_var rewrites .env and source references", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-x\nOTHER=1\n"
    );
    writeFileSync(
      join(dir, "a.ts"),
      "const k = process.env.NEXT_PUBLIC_OPENAI_KEY;\n"
    );
    const f: Finding = {
      id: "1",
      rule_id: "CG-SEC-001",
      severity: "CRITICAL",
      category: "secrets",
      file: ".env",
      range: { startLine: 1, startCol: 1, endLine: 1, endCol: 20 },
      message: "x",
      evidence: "NEXT_PUBLIC_OPENAI_KEY=sk-x",
      source_engine: "l2",
      fix_strategy: "rename_env_var",
    };
    const r = await applyFix(dir, f);
    expect(r.status).toBe("applied");
    const env = readFileSync(join(dir, ".env"), "utf8");
    expect(env).toContain("OPENAI_KEY=sk-x");
    expect(env).not.toContain("NEXT_PUBLIC_OPENAI_KEY");
    const src = readFileSync(join(dir, "a.ts"), "utf8");
    expect(src).toContain("process.env.OPENAI_KEY");
  });

  it("suggest_only adds an inline annotation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "b.ts"),
      "const q = prisma.$queryRawUnsafe(x);\n"
    );
    const f: Finding = {
      id: "2",
      rule_id: "CG-SQL-002",
      severity: "CRITICAL",
      category: "sql",
      file: "b.ts",
      range: { startLine: 1, startCol: 1, endLine: 1, endCol: 10 },
      message: "Prisma raw",
      evidence: "$queryRawUnsafe",
      source_engine: "l2",
      fix_strategy: "suggest_only",
    };
    const r = await applyFix(dir, f);
    expect(r.status).toBe("suggested");
    const src = readFileSync(join(dir, "b.ts"), "utf8");
    expect(src).toContain("claude-guard:");
  });

  it("uses # prefix for python files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, "b.py"), "x = 1\n");
    const f: Finding = {
      id: "3",
      rule_id: "CG-SQL-001",
      severity: "HIGH",
      category: "sql",
      file: "b.py",
      range: { startLine: 1, startCol: 1, endLine: 1, endCol: 5 },
      message: "m",
      evidence: "e",
      source_engine: "l2",
      fix_strategy: "suggest_only",
    };
    const r = await applyFix(dir, f);
    expect(r.status).toBe("suggested");
    const src = readFileSync(join(dir, "b.py"), "utf8");
    expect(src).toContain("# claude-guard:");
  });
});
