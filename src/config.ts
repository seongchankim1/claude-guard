import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { Config } from "./types.js";

export const defaultConfig: Config = {
  version: 1,
  layers: ["l1", "l2"],
  engines: { semgrep: "auto", gitleaks: "auto" },
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
