import { describe, it, expect } from "vitest";
import { scan } from "../src/scan.js";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("scan", () => {
  it("runs L2 alone, persists findings.json, returns summary", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_OPENAI_KEY=sk-test1234567890abcdef\n"
    );
    const res = await scan(dir, { layers: ["l2"] });
    expect(res.finding_count).toBeGreaterThan(0);
    expect(res.summary_by_severity.CRITICAL).toBeGreaterThan(0);
    const outPath = join(
      dir,
      ".claude-guard/scans",
      res.scan_id,
      "findings.json"
    );
    expect(existsSync(outPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(outPath, "utf8"));
    expect(Array.isArray(parsed.findings)).toBe(true);
    expect(parsed.findings.length).toBe(res.finding_count);
  });

  it("creates .claude-guard dirs and updates .gitignore", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, "safe.ts"), "export const x = 1;\n");
    await scan(dir, { layers: ["l2"] });
    expect(existsSync(join(dir, ".claude-guard/scans"))).toBe(true);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toContain(".claude-guard");
  });
});
