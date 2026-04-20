import { describe, it, expect } from "vitest";
import { setCookieFlags } from "../src/fix/set-cookie-flags.js";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

function finding(file: string, line: number): Finding {
  return {
    id: "f1",
    rule_id: "CG-AUTH-002",
    severity: "HIGH",
    category: "auth",
    file,
    range: { startLine: line, startCol: 1, endLine: line, endCol: 10 },
    message: "missing cookie flags",
    evidence: "cookies().set",
    source_engine: "l2",
    fix_strategy: "set_cookie_flags",
  };
}

describe("set_cookie_flags AST fix", () => {
  it("adds missing httpOnly/secure/sameSite to an options-object call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "route.ts";
    writeFileSync(
      join(dir, file),
      `import { cookies } from 'next/headers';\nexport function setIt() {\n  cookies().set({ name: 'sid', value: 'abc' });\n}\n`
    );
    const r = await setCookieFlags(dir, finding(file, 3));
    expect(r.status).toBe("applied");
    const after = readFileSync(join(dir, file), "utf8");
    expect(after).toContain("httpOnly: true");
    expect(after).toContain("secure: true");
    expect(after).toContain("sameSite: 'lax'");
  });

  it("injects options object when the call has name+value args", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "route.ts";
    writeFileSync(
      join(dir, file),
      `import { cookies } from 'next/headers';\nexport function setIt() {\n  cookies().set('sid', 'abc');\n}\n`
    );
    const r = await setCookieFlags(dir, finding(file, 3));
    expect(r.status).toBe("applied");
    const after = readFileSync(join(dir, file), "utf8");
    expect(after).toMatch(/cookies\(\)\.set\('sid',\s*'abc',\s*\{[^}]*httpOnly:\s*true/);
  });

  it("leaves existing correct flags alone", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "route.ts";
    writeFileSync(
      join(dir, file),
      `import { cookies } from 'next/headers';\nexport function setIt() {\n  cookies().set({ name: 'sid', value: 'abc', httpOnly: true, secure: true, sameSite: 'strict' });\n}\n`
    );
    const r = await setCookieFlags(dir, finding(file, 3));
    expect(r.status).toBe("skipped");
  });

  it("reports skipped when line does not contain the expected call", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "route.ts";
    writeFileSync(join(dir, file), `export const x = 1;\n`);
    const r = await setCookieFlags(dir, finding(file, 1));
    expect(r.status).toBe("skipped");
  });
});
