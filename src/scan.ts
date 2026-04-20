import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { ensureWorkspace, ensureGitignore } from "./workspace.js";
import { loadConfig } from "./config.js";
import { loadBuiltinRules } from "./rules/loader.js";
import { loadAllRules } from "./rules/plugin-loader.js";
import { runL2, dedupe } from "./engines/l2-native.js";
import { runSemgrep } from "./engines/l1-semgrep.js";
import { runGitleaks } from "./engines/l1-gitleaks.js";
import { changedFiles } from "./diff.js";
import { loadIgnore, filterIgnored } from "./ignore.js";
import { filterByInlineDisables } from "./inline-disable.js";
import { loadBaseline, filterAgainstBaseline } from "./baseline.js";
import { recordScanHistory } from "./history.js";
import type { Finding, Layer, ScanResult, Severity } from "./types.js";

export interface ScanOptions {
  layers?: Layer[];
  diff_base?: string;
  ignore_baseline?: boolean;
}

export interface PluginWarning {
  plugin: string;
  message: string;
}

export interface EngineWarning {
  engine: string; // "semgrep" | "gitleaks" | future
  message: string;
}

export interface FullScanResult extends ScanResult {
  findings: Finding[];
  outPath: string;
  baseline_suppressed?: number;
  plugin_warnings?: PluginWarning[];
  engine_warnings?: EngineWarning[];
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
  const plugin_warnings: PluginWarning[] = [];
  const engine_warnings: EngineWarning[] = [];
  if (layers.includes("l1")) {
    if (config.engines.semgrep !== "disabled") {
      const r = await runSemgrep(
        projectPath,
        config.engines.semgrep as "auto" | "enabled"
      );
      all.push(...r.findings);
      if (r.warning) engine_warnings.push({ engine: "semgrep", message: r.warning });
    }
    if (config.engines.gitleaks !== "disabled") {
      const r = await runGitleaks(
        projectPath,
        config.engines.gitleaks as "auto" | "enabled"
      );
      all.push(...r.findings);
      if (r.warning) engine_warnings.push({ engine: "gitleaks", message: r.warning });
    }
  }
  if (layers.includes("l2")) {
    const { rules, plugin_warnings: pw } = await loadAllRules(
      projectPath,
      loadBuiltinRules,
      config.plugins.allowed
    );
    plugin_warnings.push(...pw);
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
  findings = await filterByInlineDisables(projectPath, findings);

  const overrides = config.severity_overrides ?? {};
  findings = findings.map((f) =>
    overrides[f.rule_id] ? { ...f, severity: overrides[f.rule_id] } : f
  );

  let baseline_suppressed = 0;
  if (!opts.ignore_baseline) {
    const baseline = await loadBaseline(projectPath);
    if (baseline) {
      const { new_findings, suppressed } = filterAgainstBaseline(
        findings,
        baseline
      );
      findings = new_findings;
      baseline_suppressed = suppressed;
    }
  }

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
        plugin_warnings: plugin_warnings.length > 0 ? plugin_warnings : undefined,
        engine_warnings: engine_warnings.length > 0 ? engine_warnings : undefined,
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

  const duration_ms = Date.now() - t0;
  await recordScanHistory(projectPath, scan_id, filtered, duration_ms);

  return {
    scan_id,
    finding_count: filtered.length,
    duration_ms,
    layers_run: layers,
    summary_by_severity: summary,
    findings: filtered,
    outPath,
    baseline_suppressed,
    plugin_warnings: plugin_warnings.length > 0 ? plugin_warnings : undefined,
    engine_warnings: engine_warnings.length > 0 ? engine_warnings : undefined,
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
