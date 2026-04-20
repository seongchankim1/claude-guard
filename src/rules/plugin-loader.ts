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

export interface AllRulesResult {
  rules: RuleDef[];
  plugin_warnings: { plugin: string; message: string }[];
}

/**
 * Merge builtin + plugin rules with global rule-id collision protection.
 * If a plugin rule collides with a builtin (or another plugin) the plugin
 * rule is skipped and a warning is emitted. This prevents silent overrides
 * that would break SARIF rule indexing, dedupe, and baseline diffing.
 */
export async function loadAllRules(
  projectPath: string,
  builtinLoader: () => Promise<RuleDef[]>,
  allowedPlugins: string[]
): Promise<AllRulesResult> {
  const rules = await builtinLoader();
  const seenIds = new Set(rules.map((r) => r.id));
  const plugin_warnings: { plugin: string; message: string }[] = [];
  if (allowedPlugins.length > 0) {
    const results = await loadAllowedPlugins(projectPath, allowedPlugins);
    for (const p of results) {
      for (const w of p.warnings) {
        plugin_warnings.push({ plugin: p.plugin, message: w });
      }
      for (const r of p.rules) {
        if (seenIds.has(r.id)) {
          plugin_warnings.push({
            plugin: p.plugin,
            message: `rule id ${r.id} collides with an existing rule — skipped`,
          });
          continue;
        }
        seenIds.add(r.id);
        rules.push(r);
      }
    }
  }
  return { rules, plugin_warnings };
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

  // Atomic rule-set: ANY invalid rule (schema violation or unsafe regex)
  // rejects the entire plugin, so a partial load can't silently ship a
  // half-trusted ruleset. This matches the promise in docs/SECURITY_MODEL.md.
  const rulesRoots = manifest.rules ?? ["rules"];
  const collected: RuleDef[] = [];
  const invalidRules: string[] = [];
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
            invalidRules.push(`${r.id}: ${err}`);
            continue;
          }
          collected.push(r);
        }
      }
    } catch (e) {
      // Can't confirm the package is clean — fail atomically.
      return {
        plugin: pkgName,
        rules: [],
        warnings: [
          `PLUGIN_REJECTED: failed to load ${rel}: ${String(e)} — entire plugin dropped`,
        ],
      };
    }
  }

  if (invalidRules.length > 0) {
    return {
      plugin: pkgName,
      rules: [],
      warnings: [
        `PLUGIN_REJECTED: ${invalidRules.length} rule(s) failed validation — entire plugin dropped so a partially-trusted ruleset can't load. Offenders: ${invalidRules.join("; ")}`,
      ],
    };
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
