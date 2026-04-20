import { describe, it, expect } from "vitest";
import { wrapWithAuthzGuard } from "../src/fix/wrap-with-authz-guard.js";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

function f(file: string): Finding {
  return {
    id: "g1",
    rule_id: "CG-CFG-006",
    severity: "HIGH",
    category: "misconfig",
    file,
    range: { startLine: 1, startCol: 1, endLine: 1, endCol: 2 },
    message: "server action without auth",
    evidence: "use server",
    source_engine: "l2",
    fix_strategy: "wrap_with_authz_guard",
  };
}

describe("wrap_with_authz_guard fix", () => {
  it("injects auth guard and auth import into a server actions file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "actions.ts";
    writeFileSync(
      join(dir, file),
      `"use server";\nimport { prisma } from "./db";\nexport async function createPost(title: string) {\n  return prisma.post.create({ data: { title } });\n}\n`
    );
    const r = await wrapWithAuthzGuard(dir, f(file));
    expect(r.status).toBe("applied");
    const after = readFileSync(join(dir, file), "utf8");
    expect(after).toContain("import { auth }");
    expect(after).toContain("const __session = await auth();");
    expect(after).toContain("Unauthorized");
  });

  it("skips when file is not a Server Actions module", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "regular.ts";
    writeFileSync(
      join(dir, file),
      `export async function hello() { return 1; }\n`
    );
    const r = await wrapWithAuthzGuard(dir, f(file));
    expect(r.status).toBe("skipped");
  });

  it("skips when an auth check is already present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "actions.ts";
    writeFileSync(
      join(dir, file),
      `"use server";\nimport { auth } from "./auth";\nexport async function createPost(t: string) {\n  const s = await auth();\n  if (!s) throw new Error();\n  return t;\n}\n`
    );
    const r = await wrapWithAuthzGuard(dir, f(file));
    expect(r.status).toBe("skipped");
  });
});
