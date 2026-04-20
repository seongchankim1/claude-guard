import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runL2 } from "../src/engines/l2-native.js";
import type { RuleDef } from "../src/types.js";

describe("RulePattern.negate", () => {
  it("suppresses matches when a negate pattern also matches the hit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-negate-"));
    writeFileSync(
      join(dir, ".env"),
      [
        "NEXT_PUBLIC_OPENAI_SECRET=sk-should-flag",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-should-skip",
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk-should-skip",
      ].join("\n") + "\n"
    );

    const rule: RuleDef = {
      id: "CG-SEC-001",
      title: "test",
      severity: "CRITICAL",
      category: "secrets",
      patterns: [
        {
          regex: "NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE)",
          files: [".env*"],
          negate: ["ANON_KEY", "PUBLISHABLE_KEY"],
        },
      ],
    };

    const findings = await runL2(dir, [rule]);
    // Only the one genuine secret should remain after negation.
    expect(findings).toHaveLength(1);
    expect(findings[0].evidence).toMatch(/NEXT_PUBLIC_OPENAI_SECRET/);
  });

  it("still fires if negate list is empty (backward compatible)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-negate-empty-"));
    writeFileSync(
      join(dir, ".env"),
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=anon\n"
    );

    const rule: RuleDef = {
      id: "CG-SEC-001",
      title: "test",
      severity: "CRITICAL",
      category: "secrets",
      patterns: [
        {
          regex: "NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD|PRIVATE)",
          files: [".env*"],
        },
      ],
    };

    const findings = await runL2(dir, [rule]);
    expect(findings.length).toBe(1);
  });
});
