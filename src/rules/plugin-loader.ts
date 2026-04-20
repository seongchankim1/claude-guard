import { readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve, join } from "path";
import yaml from "js-yaml";
import { loadRulesFromDir, validateRule } from "./loader.js";
import type { RuleDef } from "../types.js";

const req = createRequire(import.meta.url);

interface PluginManifest {
  name: string;
  version: string;
  rules?: string[];
  checks?: { categories?: string[] };
}

export interface PluginLoadResult {
  plugin: string;
  rules: RuleDef[];
  warnings: string[];
}

export async function loadAllowedPlugins(
  projectPath: string,
  allowed: string[]
): Promise<PluginLoadResult[]> {
  const results: PluginLoadResult[] = [];
  for (const pkgName of allowed) {
    results.push(await loadOnePlugin(projectPath, pkgName));
  }
  return results;
}

async function loadOnePlugin(
  projectPath: string,
  pkgName: string
): Promise<PluginLoadResult> {
  const warnings: string[] = [];
  const pkgRoot = resolvePluginRoot(projectPath, pkgName);
  if (!pkgRoot) {
    return {
      plugin: pkgName,
      rules: [],
      warnings: [`plugin not found in node_modules: ${pkgName}`],
    };
  }

  const manifestPath = join(pkgRoot, "claude-guard-plugin.yml");
  if (!existsSync(manifestPath)) {
    return {
      plugin: pkgName,
      rules: [],
      warnings: [`missing manifest claude-guard-plugin.yml in ${pkgName}`],
    };
  }

  let manifest: PluginManifest;
  try {
    const raw = await readFile(manifestPath, "utf8");
    manifest = yaml.load(raw) as PluginManifest;
  } catch (e) {
    return {
      plugin: pkgName,
      rules: [],
      warnings: [`cannot parse manifest: ${String(e)}`],
    };
  }

  if (!manifest.name || !manifest.version) {
    return {
      plugin: pkgName,
      rules: [],
      warnings: [`manifest missing name or version`],
    };
  }

  const rulesRoots = manifest.rules ?? ["rules"];
  const collected: RuleDef[] = [];
  for (const rel of rulesRoots) {
    const abs = resolve(pkgRoot, rel);
    if (!existsSync(abs)) {
      warnings.push(`rules path not found: ${rel}`);
      continue;
    }
    try {
      const stats = await stat(abs);
      if (stats.isDirectory()) {
        const loaded = await loadRulesFromDir(abs);
        for (const r of loaded) {
          const err = validateRule(r);
          if (err) {
            warnings.push(`rule ${r.id} invalid: ${err}`);
            continue;
          }
          collected.push(r);
        }
      }
    } catch (e) {
      warnings.push(`failed to load ${rel}: ${String(e)}`);
    }
  }

  return { plugin: pkgName, rules: collected, warnings };
}

function resolvePluginRoot(projectPath: string, pkgName: string): string | null {
  try {
    const fromProject = req.resolve(`${pkgName}/package.json`, {
      paths: [projectPath],
    });
    return dirname(fromProject);
  } catch {
    // try bare path under node_modules (when the plugin has no package.json entry)
    const candidate = join(projectPath, "node_modules", pkgName);
    return existsSync(candidate) ? candidate : null;
  }
}
