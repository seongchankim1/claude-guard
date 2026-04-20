import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { Config } from "./types.js";

export const defaultConfig: Config = {
  version: 1,
  layers: ["l1", "l2"],
  engines: {
    // Semgrep defaults to DISABLED so the "zero network calls by default"
    // contract in the README is actually true. Its `p/default` ruleset is
    // fetched from semgrep.dev on first run; users must opt in explicitly
    // with `engines.semgrep: auto` or `enabled`.
    semgrep: "disabled",
    // Gitleaks ships an embedded ruleset and runs fully offline, so it
    // stays on `auto`: if the binary is on PATH, we use it.
    gitleaks: "auto",
  },
  plugins: { allowed: [] },
  severity_threshold: "LOW",
  severity_overrides: {},
  fix: { dry_run_default: false, require_clean_tree: true },
  redteam: { enabled: false },
};

export async function loadConfig(projectPath: string): Promise<Config> {
  const configPath = join(projectPath, ".claude-guard", "config.yaml");
  if (!existsSync(configPath)) return defaultConfig;
  const raw = await readFile(configPath, "utf8");
  const parsed = (yaml.load(raw) ?? {}) as Partial<Config>;
  return {
    ...defaultConfig,
    ...parsed,
    engines: { ...defaultConfig.engines, ...(parsed.engines ?? {}) },
    plugins: { ...defaultConfig.plugins, ...(parsed.plugins ?? {}) },
    fix: { ...defaultConfig.fix, ...(parsed.fix ?? {}) },
    redteam: { ...defaultConfig.redteam, ...(parsed.redteam ?? {}) },
  };
}

export function renderDefaultConfigYaml(): string {
  return yaml.dump(defaultConfig);
}
