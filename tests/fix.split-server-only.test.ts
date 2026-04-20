import { describe, it, expect } from "vitest";
import { splitServerOnly } from "../src/fix/split-server-only.js";
import { mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Finding } from "../src/types.js";

function f(file: string): Finding {
  return {
    id: "x",
    rule_id: "CG-SEC-003",
    severity: "CRITICAL",
    category: "secrets",
    file,
    range: { startLine: 1, startCol: 1, endLine: 1, endCol: 2 },
    message: "m",
    evidence: "e",
    source_engine: "l2",
    fix_strategy: "split_server_only",
  };
}

describe("split_server_only fix", () => {
  it("prepends import 'server-only' when missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "supabase.ts";
    writeFileSync(
      join(dir, file),
      `import { createClient } from "@supabase/supabase-js";\nexport const sb = createClient("u", process.env.SUPABASE_SERVICE_ROLE!);\n`
    );
    const r = await splitServerOnly(dir, f(file));
    expect(r.status).toBe("applied");
    const after = readFileSync(join(dir, file), "utf8");
    expect(after.startsWith('import "server-only"')).toBe(true);
  });

  it("skips when server-only import is already present", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const file = "supabase.ts";
    writeFileSync(
      join(dir, file),
      `import "server-only";\nimport { createClient } from "@supabase/supabase-js";\n`
    );
    const r = await splitServerOnly(dir, f(file));
    expect(r.status).toBe("skipped");
  });
});
