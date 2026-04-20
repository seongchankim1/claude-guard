import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { ensureWorkspace, ensureGitignore } from "./workspace.js";
import { loadConfig } from "./config.js";
import { loadBuiltinRules } from "./rules/loader.js";
import { loadAllowedPlugins } from "./rules/plugin-loader.js";
import { runL2, dedupe } from "./engines/l2-native.js";
import { runSemgrep } from "./engines/l1-semgrep.js";
import { runGitleaks } from "./engines/l1-gitleaks.js";
import { changedFiles } from "./diff.js";
import { loadIgnore, filterIgnored } from "./ignore.js";
import type { Finding, Layer, ScanResult, Severity } from "./types.js";

export interface ScanOptions {
  layers?: Layer[];
  diff_base?: string;
}

export interface FullScanResult extends ScanResult {
  findings: Finding[];
  outPath: string;
}

export async function scan(
  projectPath: string,
  opts: ScanOptions = {}
): Promise<FullScanResult> {
  const t0 = Date.now();
  await ensureWorkspace(projectPath);
  await ensureGitignore(projectPath);
  const config = await loadConfig(projectPath);
  const layers = opts.layers ?? config.layers;

  const all: Finding[] = [];
  if (layers.includes("l1")) {
    all.push(...(await runSemgrep(projectPath)));
    all.push(...(await runGitleaks(projectPath)));
  }
  if (layers.includes("l2")) {
    const rules = await loadBuiltinRules();
    if (config.plugins.allowed.length > 0) {
      const pluginResults = await loadAllowedPlugins(
        projectPath,
        config.plugins.allowed
      );
      for (const p of pluginResults) {
        rules.push(...p.rules);
      }
    }
    all.push(...(await runL2(projectPath, rules)));
  }
  let findings = dedupe(all);

  if (opts.diff_base) {
    const diff = await changedFiles(projectPath, opts.diff_base);
    const allowed = new Set(diff.files);
    findings = findings.filter((f) => allowed.has(f.file));
  }

  const ignoreEntries = await loadIgnore(projectPath);
  findings = filterIgnored(findings, ignoreEntries);

  const threshold = severityRank(config.severity_threshold);
  const filtered = findings.filter(
    (f) => severityRank(f.severity) >= threshold
  );

  const scan_id = randomUUID();
  const outDir = join(projectPath, ".claude-guard", "scans", scan_id);
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "findings.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        scan_id,
        created_at: new Date().toISOString(),
        findings: filtered,
      },
      null,
      2
    )
  );

  const summary: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const f of filtered) summary[f.severity]++;

  return {
    scan_id,
    finding_count: filtered.length,
    duration_ms: Date.now() - t0,
    layers_run: layers,
    summary_by_severity: summary,
    findings: filtered,
    outPath,
  };
}

function severityRank(s: Severity): number {
  const ranks: Record<Severity, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
  };
  return ranks[s];
}
