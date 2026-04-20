import { describe, it, expect } from "vitest";
import { suppressFinding } from "../src/suppress.js";
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import yaml from "js-yaml";
import type { Finding } from "../src/types.js";

function mk(id = "f1"): Finding {
  return {
    id,
    rule_id: "CG-SEC-001",
    severity: "CRITICAL",
    category: "secrets",
    file: "app/env.ts",
    range: { startLine: 12, startCol: 1, endLine: 12, endCol: 30 },
    message: "m",
    evidence: "NEXT_PUBLIC_OPENAI_KEY=x",
    source_engine: "l2",
  };
}

describe("suppress", () => {
  it("creates ignore.yml with a matching entry", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await suppressFinding(dir, mk(), "false positive — handled on server");
    expect(r.added).toBe(true);
    const data = yaml.load(readFileSync(r.path, "utf8")) as { ignore: unknown[] };
    expect(data.ignore).toHaveLength(1);
    expect((data.ignore[0] as { reason: string }).reason).toContain("false positive");
  });

  it("no-ops on duplicate suppression", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    await suppressFinding(dir, mk());
    const r = await suppressFinding(dir, mk("f2"));
    expect(r.added).toBe(false);
    expect(r.reason).toMatch(/already/);
  });

  it("appends to an existing ignore.yml with other entries", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    await suppressFinding(dir, mk());
    const second: Finding = {
      ...mk("f2"),
      rule_id: "CG-XSS-001",
      file: "app/view.tsx",
      range: { startLine: 3, startCol: 1, endLine: 3, endCol: 10 },
    };
    const r = await suppressFinding(dir, second);
    expect(r.added).toBe(true);
    const data = yaml.load(readFileSync(r.path, "utf8")) as { ignore: unknown[] };
    expect(data.ignore).toHaveLength(2);
  });
});
