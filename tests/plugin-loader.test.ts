import { describe, it, expect } from "vitest";
import { loadAllowedPlugins } from "../src/rules/plugin-loader.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function seedPlugin(projectRoot: string, name: string): string {
  const pkgRoot = join(projectRoot, "node_modules", name);
  mkdirSync(join(pkgRoot, "rules"), { recursive: true });
  writeFileSync(
    join(pkgRoot, "package.json"),
    JSON.stringify({ name, version: "1.0.0" })
  );
  writeFileSync(
    join(pkgRoot, "claude-guard-plugin.yml"),
    `name: ${name}\nversion: 1.0.0\nrules:\n  - rules\n`
  );
  writeFileSync(
    join(pkgRoot, "rules", "CG-CUSTOM-001.yml"),
    [
      "id: CG-CUSTOM-001",
      "title: \"custom plugin rule\"",
      "severity: HIGH",
      "category: other",
      "patterns:",
      "  - regex: \"MYCUSTOM_TOKEN\"",
      "    files: [\"**/*.txt\"]",
      "fix_strategy: suggest_only",
    ].join("\n") + "\n"
  );
  return pkgRoot;
}

describe("plugin loader", () => {
  it("loads rules from a YAML-only plugin", async () => {
    const project = mkdtempSync(join(tmpdir(), "cg-"));
    seedPlugin(project, "claude-guard-plugin-demo");
    const results = await loadAllowedPlugins(project, [
      "claude-guard-plugin-demo",
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].rules).toHaveLength(1);
    expect(results[0].rules[0].id).toBe("CG-CUSTOM-001");
    expect(results[0].warnings).toEqual([]);
  });

  it("returns warnings for unknown plugin and keeps going", async () => {
    const project = mkdtempSync(join(tmpdir(), "cg-"));
    const results = await loadAllowedPlugins(project, ["nonexistent-plugin"]);
    expect(results[0].rules).toEqual([]);
    expect(results[0].warnings[0]).toContain("not found");
  });

  it("rejects a plugin with a missing manifest", async () => {
    const project = mkdtempSync(join(tmpdir(), "cg-"));
    const pkgRoot = join(project, "node_modules", "broken-plugin");
    mkdirSync(pkgRoot, { recursive: true });
    writeFileSync(
      join(pkgRoot, "package.json"),
      JSON.stringify({ name: "broken-plugin", version: "1.0.0" })
    );
    const results = await loadAllowedPlugins(project, ["broken-plugin"]);
    expect(results[0].rules).toEqual([]);
    expect(results[0].warnings[0]).toContain("missing manifest");
  });

  it("drops the ENTIRE plugin if any rule fails validation (atomic)", async () => {
    const project = mkdtempSync(join(tmpdir(), "cg-atomic-"));
    const pkgRoot = join(project, "node_modules", "mixed-plugin");
    mkdirSync(join(pkgRoot, "rules"), { recursive: true });
    writeFileSync(
      join(pkgRoot, "package.json"),
      JSON.stringify({ name: "mixed-plugin", version: "1.0.0" })
    );
    writeFileSync(
      join(pkgRoot, "claude-guard-plugin.yml"),
      "name: mixed-plugin\nversion: 1.0.0\nrules: [rules]\n"
    );
    // Good rule — would load on its own.
    writeFileSync(
      join(pkgRoot, "rules", "good.yml"),
      [
        "id: PL-GOOD-001",
        "title: fine",
        "severity: LOW",
        "category: other",
        "patterns:",
        "  - regex: 'ok'",
      ].join("\n") + "\n"
    );
    // Bad rule — unsafe regex (catastrophic backtracking). safe-regex2 rejects.
    writeFileSync(
      join(pkgRoot, "rules", "bad.yml"),
      [
        "id: PL-BAD-001",
        "title: unsafe regex",
        "severity: LOW",
        "category: other",
        "patterns:",
        "  - regex: '(a+)+$'",
      ].join("\n") + "\n"
    );
    const results = await loadAllowedPlugins(project, ["mixed-plugin"]);
    // With non-atomic loading, PL-GOOD-001 would have sneaked through.
    // Atomic loading drops both.
    expect(results[0].rules).toEqual([]);
    expect(results[0].warnings.join("\n")).toMatch(/PLUGIN_REJECTED/);
    expect(results[0].warnings.join("\n")).toMatch(/PL-BAD-001/);
  });
});
