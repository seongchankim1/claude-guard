import { describe, it, expect } from "vitest";
import { detectStack, runInit } from "../src/init.js";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("init", () => {
  it("detects Next.js + Supabase + Prisma from package.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        dependencies: {
          next: "^14",
          react: "^18",
          "@supabase/supabase-js": "^2",
          "@prisma/client": "^5",
        },
      })
    );
    const stack = await detectStack(dir);
    expect(stack.nextjs).toBe(true);
    expect(stack.react).toBe(true);
    expect(stack.supabase).toBe(true);
    expect(stack.prisma).toBe(true);
    expect(stack.express).toBe(false);
  });

  it("writes config.yaml with severity overrides for unused stacks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { next: "^14", react: "^18" } })
    );
    const r = await runInit({ projectPath: dir, write: true });
    expect(r.wrote_config).toBe(true);
    expect(existsSync(r.config_path)).toBe(true);
    const content = readFileSync(r.config_path, "utf8");
    expect(content).toContain("severity_overrides");
    // no tf, no k8s, no docker — they should be demoted
    expect(content).toContain("CG-IAC-001");
    expect(content).toContain("CG-DOCKER-001");
    // supabase rule is demoted (no supabase in deps)
    expect(content).toContain("CG-SEC-003");
  });

  it("dry run does not write the config file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    writeFileSync(join(dir, "package.json"), "{}");
    const r = await runInit({ projectPath: dir, write: false });
    expect(r.wrote_config).toBe(false);
    expect(existsSync(r.config_path)).toBe(false);
  });

  it("does not overwrite an existing config", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    mkdirSync(join(dir, ".claude-guard"));
    writeFileSync(join(dir, ".claude-guard/config.yaml"), "version: 1\n");
    writeFileSync(join(dir, "package.json"), "{}");
    const r = await runInit({ projectPath: dir, write: true });
    expect(r.wrote_config).toBe(false);
    const content = readFileSync(r.config_path, "utf8");
    expect(content).toBe("version: 1\n");
  });
});
