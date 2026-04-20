import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scan } from "../src/scan.js";

// Regression: when config opts into a plugin that isn't installed, the
// loader emits a warning. Before this fix, scan.ts dropped warnings on
// the floor — now they must reach the caller so docs/SECURITY_MODEL.md's
// PLUGIN_UNTRUSTED/PLUGIN_MISSING claim is truthful.
describe("scan surfaces plugin warnings", () => {
  it("propagates plugin loader warnings into the scan result", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-plugin-warn-"));
    mkdirSync(join(dir, ".claude-guard"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-guard/config.yaml"),
      [
        "version: 1",
        "plugins:",
        "  allowed:",
        "    - no-such-plugin-pkg",
      ].join("\n") + "\n"
    );

    const r = await scan(dir, { layers: ["l2"], ignore_baseline: true });
    expect(r.plugin_warnings, "plugin_warnings should be defined").toBeDefined();
    expect(r.plugin_warnings!.length).toBeGreaterThan(0);
    expect(r.plugin_warnings![0].plugin).toBe("no-such-plugin-pkg");
    expect(r.plugin_warnings![0].message).toMatch(/plugin not found/i);
  });
});
