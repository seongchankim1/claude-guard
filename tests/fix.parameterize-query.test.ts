import { describe, it, expect } from "vitest";
import { parameterizeQuery } from "../src/fix/parameterize-query.js";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

function f(file: string, line: number): Finding {
  return {
    id: "p1",
    rule_id: "CG-SQL-002",
    severity: "CRITICAL",
    category: "sql",
    file,
    range: { startLine: line, startCol: 1, endLine: line, endCol: 2 },
    message: "prisma raw",
    evidence: "$queryRawUnsafe",
    source_engine: "l2",
    fix_strategy: "parameterize_query",
  };
}

describe("parameterize_query fix", () => {
  it("rewrites $queryRawUnsafe(template) → $queryRaw`template`", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "repo.ts";
    writeFileSync(
      join(dir, file),
      "import { prisma } from './db';\nexport async function run(x: string) {\n  return prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${x}'`);\n}\n"
    );
    const r = await parameterizeQuery(dir, f(file, 3));
    expect(r.status).toBe("applied");
    const after = readFileSync(join(dir, file), "utf8");
    expect(after).toContain("$queryRaw`SELECT");
    expect(after).not.toContain("$queryRawUnsafe");
  });

  it("rewrites string + param args → tagged template with interpolations", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "repo.ts";
    writeFileSync(
      join(dir, file),
      "import { prisma } from './db';\nexport async function run(id: number) {\n  return prisma.$queryRawUnsafe(\"SELECT * FROM users WHERE id = $1\", id);\n}\n"
    );
    const r = await parameterizeQuery(dir, f(file, 3));
    expect(r.status).toBe("applied");
    const after = readFileSync(join(dir, file), "utf8");
    expect(after).toContain("$queryRaw`SELECT");
    expect(after).toContain("${id}");
  });

  it("skips when no Unsafe call near target line", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "repo.ts";
    writeFileSync(join(dir, file), "export const x = 1;\n");
    const r = await parameterizeQuery(dir, f(file, 1));
    expect(r.status).toBe("skipped");
  });
});
