import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadAllRules } from "../src/rules/plugin-loader.js";
import type { RuleDef } from "../src/types.js";

describe("loadAllRules collision guard", () => {
  it("skips plugin rules that collide with a builtin id and warns", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-collision-"));
    const nm = join(dir, "node_modules/fake-plugin");
    mkdirSync(join(nm, "rules"), { recursive: true });
    writeFileSync(
      join(nm, "package.json"),
      JSON.stringify({ name: "fake-plugin", version: "0.0.1" })
    );
    writeFileSync(
      join(nm, "claude-guard-plugin.yml"),
      "name: fake-plugin\nversion: 0.0.1\nrules: [rules]\n"
    );
    // Deliberately collide with a well-known builtin id.
    writeFileSync(
      join(nm, "rules", "clash.yml"),
      [
        "id: CG-SEC-001",
        "title: clashing rule",
        "severity: HIGH",
        "category: secrets",
        "patterns:",
        "  - regex: 'never'",
      ].join("\n") + "\n"
    );

    const fakeBuiltin: RuleDef[] = [
      {
        id: "CG-SEC-001",
        title: "builtin",
        severity: "CRITICAL",
        category: "secrets",
        patterns: [{ regex: "NEVER" }],
      },
    ];

    const { rules, plugin_warnings } = await loadAllRules(
      dir,
      async () => fakeBuiltin,
      ["fake-plugin"]
    );

    expect(rules.length).toBe(1);
    expect(rules[0].title).toBe("builtin");
    const collisionWarning = plugin_warnings.find((w) =>
      /collides/i.test(w.message)
    );
    expect(collisionWarning, "expected a collision warning").toBeDefined();
    expect(collisionWarning!.plugin).toBe("fake-plugin");
  });

  it("accepts plugin rules with unique ids", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-unique-"));
    const nm = join(dir, "node_modules/unique-plugin");
    mkdirSync(join(nm, "rules"), { recursive: true });
    writeFileSync(
      join(nm, "package.json"),
      JSON.stringify({ name: "unique-plugin", version: "0.0.1" })
    );
    writeFileSync(
      join(nm, "claude-guard-plugin.yml"),
      "name: unique-plugin\nversion: 0.0.1\nrules: [rules]\n"
    );
    writeFileSync(
      join(nm, "rules", "novel.yml"),
      [
        "id: PL-TEST-001",
        "title: novel plugin rule",
        "severity: LOW",
        "category: other",
        "patterns:",
        "  - regex: 'zz'",
      ].join("\n") + "\n"
    );

    const { rules } = await loadAllRules(
      dir,
      async () => [],
      ["unique-plugin"]
    );
    expect(rules.map((r) => r.id)).toContain("PL-TEST-001");
  });
});
