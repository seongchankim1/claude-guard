import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";
import { writeFileSync, mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("config", () => {
  it("returns defaults when no config file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const c = await loadConfig(dir);
    expect(c.version).toBe(1);
    expect(c.layers).toEqual(["l1", "l2"]);
    expect(c.redteam.enabled).toBe(false);
  });
  it("merges user config over defaults", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, ".claude-guard"));
    writeFileSync(
      join(dir, ".claude-guard/config.yaml"),
      "version: 1\nredteam:\n  enabled: true\n  allowed_targets: [localhost]\n"
    );
    const c = await loadConfig(dir);
    expect(c.redteam.enabled).toBe(true);
    expect(c.severity_threshold).toBe("LOW");
  });
});
