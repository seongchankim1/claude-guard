import { describe, it, expect } from "vitest";
import { loadBuiltinRules, validateRule, isRegexSafe } from "../src/rules/loader.js";

describe("rule loader", () => {
  it("loads all builtin rules and they validate", async () => {
    const rules = await loadBuiltinRules();
    expect(rules.length).toBeGreaterThanOrEqual(10);
    for (const r of rules) {
      const err = validateRule(r);
      expect(err, `Rule ${r.id} invalid: ${err}`).toBeNull();
    }
  });
  it("rejects unsafe regex (ReDoS-style)", () => {
    expect(isRegexSafe("(a+)+$")).toBe(false);
  });
  it("accepts safe regex", () => {
    expect(isRegexSafe("^hello$")).toBe(true);
    expect(isRegexSafe("NEXT_PUBLIC_[A-Z_]+")).toBe(true);
  });
  it("rejects malformed rule (missing required fields)", () => {
    expect(validateRule({ id: "CG-X-001", title: "y" } as unknown)).not.toBeNull();
  });
  it("rejects bad severity", () => {
    expect(
      validateRule({
        id: "CG-AA-001",
        title: "y",
        severity: "URGENT",
        category: "secrets",
        patterns: [{ regex: "x" }],
      } as unknown)
    ).not.toBeNull();
  });
});
