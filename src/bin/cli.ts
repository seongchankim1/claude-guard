#!/usr/bin/env node
import { scan } from "../scan.js";
import { renderFindingsMd } from "../findings-md.js";
import { loadBuiltinRules } from "../rules/loader.js";
import { scoreFindings, renderScorecardMd } from "../scorecard.js";
import { scorecardToBadge } from "../badge.js";
import { renderRulesCatalogMd } from "../rules-catalog.js";
import { findingsToSarif } from "../sarif.js";
import { renderHtmlReport } from "../html-report.js";
import { renderJunitXml } from "../junit.js";
import { renderCsv } from "../csv.js";
import { installGitHook } from "../install-hooks.js";
import { captureBaseline, loadBaseline, diffFindings } from "../baseline.js";
import { summarize } from "../stats.js";
import { runInit } from "../init.js";
import { suppressFinding } from "../suppress.js";
import { loadHistory, renderTrendMd } from "../history.js";
import { color, gradeColor } from "../color.js";
import { applyFixes } from "../apply.js";
import { renderFindingsMd as renderFindingsMdForWrite } from "../findings-md.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { globby } from "globby";
import type { Finding } from "../types.js";

const HELP = `claude-guard — CLI
Usage:
  claude-guard scan [path] [--json] [--diff=main] [--severity=HIGH] [--only=secrets,sql] [--except=llm]
      Run scan. --severity floor, --only/--except filter by category, --diff scans only changed files vs the base ref.
  claude-guard fix [path]            One-shot scan + apply_fixes in "all_safe" mode
  claude-guard list [path]           Render findings.md for latest scan
  claude-guard score [path]          Show grade/score for latest scan
  claude-guard badge [path]          Emit shields.io endpoint JSON for the latest scan
  claude-guard sarif [path]          Emit SARIF 2.1.0 for the latest scan (GitHub Code Scanning)
  claude-guard junit [path]          Emit JUnit XML for CI systems that grok it
  claude-guard csv [path]            Emit findings as CSV (spreadsheet-friendly)
  claude-guard validate-rule <file>  Validate a single rule YAML against the schema + ReDoS guard
  claude-guard report [path] [--open]   Write a self-contained HTML report; --open launches the browser
  claude-guard watch [path]          Rescan on file change (debounced)
  claude-guard install-hooks [path]  Install a pre-commit hook that blocks CRITICAL findings in staged files
  claude-guard baseline [path]       Capture current findings as a baseline; future scans only report new ones
  claude-guard diff-scans <a> <b> [path]   Compare two scan_ids: what was introduced, resolved, unchanged
  claude-guard stats [path]          Rule hit frequency, top files, category breakdown for the latest scan
  claude-guard init [path] [--dry]   Detect stack, write .claude-guard/config.yaml with smart severity overrides
  claude-guard suppress <finding_id> [path] [--reason="…"]   Add an entry to .claude-guard/ignore.yml for this finding
  claude-guard trend [path]          Show scan history: grade, score, finding count per scan
  claude-guard explain <id> [path]   Show details for a finding
  claude-guard rules                 List active builtin rules
  claude-guard docs                  Print a markdown catalogue of every active rule
  claude-guard --help                This message

All commands operate on <path> (or current working directory) and require a prior scan for list/score/badge/sarif/explain.
`;

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === "rules") {
    const rules = await loadBuiltinRules();
    const byCat: Record<string, number> = {};
    for (const r of rules) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
    process.stdout.write(`Total rules: ${rules.length}\n`);
    for (const [c, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`  ${c}: ${n}\n`);
    }
    return 0;
  }

  if (cmd === "scan") {
    const positional = rest.filter((s) => !s.startsWith("--"));
    const diffFlag = rest.find((s) => s.startsWith("--diff="));
    const diff_base = diffFlag ? diffFlag.slice("--diff=".length) : undefined;
    const jsonMode = rest.includes("--json");
    const sevFlag = rest.find((s) => s.startsWith("--severity="));
    const onlyFlag = rest.find((s) => s.startsWith("--only="));
    const exceptFlag = rest.find((s) => s.startsWith("--except="));
    const severityFloor = sevFlag ? (sevFlag.slice("--severity=".length).toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW") : undefined;
    const onlyCats = onlyFlag ? new Set(onlyFlag.slice("--only=".length).split(",")) : null;
    const exceptCats = exceptFlag ? new Set(exceptFlag.slice("--except=".length).split(",")) : null;
    const projectPath = resolve(positional[0] ?? ".");
    const r = await scan(projectPath, { layers: ["l1", "l2"], diff_base });
    if (severityFloor || onlyCats || exceptCats) {
      const ranks: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const floor = severityFloor ? ranks[severityFloor] : 0;
      const filtered = r.findings.filter((f) => {
        if (ranks[f.severity] < floor) return false;
        if (onlyCats && !onlyCats.has(f.category)) return false;
        if (exceptCats && exceptCats.has(f.category)) return false;
        return true;
      });
      (r as { findings: typeof r.findings }).findings = filtered;
      (r as { finding_count: number }).finding_count = filtered.length;
      const recomputed: typeof r.summary_by_severity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const f of filtered) recomputed[f.severity]++;
      (r as { summary_by_severity: typeof r.summary_by_severity }).summary_by_severity = recomputed;
    }
    const card = scoreFindings(r.findings);
    if (jsonMode || !process.stdout.isTTY) {
      process.stdout.write(
        JSON.stringify(
          {
            scan_id: r.scan_id,
            finding_count: r.finding_count,
            duration_ms: r.duration_ms,
            layers_run: r.layers_run,
            summary_by_severity: r.summary_by_severity,
            scorecard: card,
          },
          null,
          2
        ) + "\n"
      );
    } else {
      const paint = gradeColor(card.grade);
      const label = paint(color.bold(`  ${card.grade}  `));
      process.stdout.write(
        `${label}  ${color.bold(`${card.score}/100`)}  ${color.dim(card.headline)}\n`
      );
      process.stdout.write(
        color.dim(
          `  scan_id=${r.scan_id.slice(0, 8)}  findings=${r.finding_count}  duration=${r.duration_ms}ms  layers=${r.layers_run.join(",")}\n`
        )
      );
      const sev = r.summary_by_severity;
      process.stdout.write(
        `  ${color.red(`${sev.CRITICAL} CRITICAL`)}  ${color.yellow(`${sev.HIGH} HIGH`)}  ${color.cyan(`${sev.MEDIUM} MEDIUM`)}  ${color.gray(`${sev.LOW} LOW`)}\n`
      );
      process.stdout.write(
        color.dim("  next: claude-guard list   # toggle [x] on fixes\n")
      );
    }
    return r.summary_by_severity.CRITICAL > 0 ? 2 : 0;
  }

  if (cmd === "fix") {
    const projectPath = resolve(rest[0] ?? ".");
    const r = await scan(projectPath, { layers: ["l1", "l2"] });
    if (r.finding_count === 0) {
      process.stdout.write(color.green("No findings. Nothing to fix.\n"));
      return 0;
    }
    const md = renderFindingsMdForWrite(r.scan_id, r.findings);
    await mkdir(join(projectPath, ".claude-guard"), { recursive: true });
    await writeFile(join(projectPath, ".claude-guard/findings.md"), md);
    const apply = await applyFixes(projectPath, { scan_id: r.scan_id, mode: "all_safe" });
    process.stdout.write(
      JSON.stringify(
        {
          scan_id: r.scan_id,
          applied: apply.applied.length,
          suggested: apply.suggested.length,
          skipped: apply.skipped.length,
          failed: apply.failed.length,
          branch: apply.branch,
          diff_path: apply.diff_path,
        },
        null,
        2
      ) + "\n"
    );
    return 0;
  }

  if (cmd === "list") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const md = renderFindingsMd(sid, findings);
    await mkdir(join(projectPath, ".claude-guard"), { recursive: true });
    await writeFile(join(projectPath, ".claude-guard/findings.md"), md);
    process.stdout.write(md);
    return 0;
  }

  if (cmd === "score") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const card = scoreFindings(findings);
    process.stdout.write(renderScorecardMd(card));
    return 0;
  }

  if (cmd === "badge") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const card = scoreFindings(findings);
    process.stdout.write(JSON.stringify(scorecardToBadge(card), null, 2) + "\n");
    return 0;
  }

  if (cmd === "docs") {
    const rules = await loadBuiltinRules();
    process.stdout.write(renderRulesCatalogMd(rules));
    return 0;
  }

  if (cmd === "sarif") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const rules = await loadBuiltinRules();
    process.stdout.write(JSON.stringify(findingsToSarif(findings, rules), null, 2) + "\n");
    return 0;
  }

  if (cmd === "watch") {
    const projectPath = resolve(rest[0] ?? ".");
    await runWatch(projectPath);
    return 0;
  }

  if (cmd === "report") {
    const positional = rest.filter((s) => !s.startsWith("--"));
    const open = rest.includes("--open");
    const projectPath = resolve(positional[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const html = renderHtmlReport(sid, findings);
    const outPath = join(projectPath, ".claude-guard/report.html");
    await mkdir(join(projectPath, ".claude-guard"), { recursive: true });
    await writeFile(outPath, html);
    process.stdout.write(`Wrote ${outPath}\n`);
    if (open) await openInBrowser(outPath);
    return 0;
  }

  if (cmd === "junit") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    process.stdout.write(renderJunitXml(findings));
    return 0;
  }

  if (cmd === "csv") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    process.stdout.write(renderCsv(findings));
    return 0;
  }

  if (cmd === "validate-rule") {
    const file = rest[0];
    if (!file) {
      process.stderr.write("Usage: claude-guard validate-rule <rule.yml>\n");
      return 1;
    }
    const { validateRule } = await import("../rules/loader.js");
    const yaml = await import("js-yaml");
    try {
      const content = await readFile(resolve(file), "utf8");
      const parsed = yaml.default.load(content);
      const err = validateRule(parsed);
      if (err) {
        process.stderr.write(`${color.red("✗")} invalid: ${err}\n`);
        return 1;
      }
      const r = parsed as { id: string; title: string; severity: string; patterns: unknown[] };
      process.stdout.write(
        `${color.green("✓")} ${r.id} — ${r.title} (${r.severity}, ${r.patterns.length} pattern(s))\n`
      );
      return 0;
    } catch (e) {
      process.stderr.write(`claude-guard validate-rule: ${e instanceof Error ? e.message : String(e)}\n`);
      return 1;
    }
  }

  if (cmd === "install-hooks") {
    const projectPath = resolve(rest[0] ?? ".");
    const r = await installGitHook(projectPath);
    if (!r.wrote) {
      process.stderr.write(`claude-guard install-hooks: ${r.reason ?? "no-op"}\n`);
      return r.path === "" ? 1 : 0;
    }
    process.stdout.write(`Installed pre-commit hook at ${r.path}${r.reason ? ` (${r.reason})` : ""}\n`);
    return 0;
  }

  if (cmd === "baseline") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const path = await captureBaseline(projectPath, sid, findings);
    process.stdout.write(
      `Wrote ${path} — ${findings.length} finding(s) captured as baseline. Future scans will only report NEW findings.\n`
    );
    return 0;
  }

  if (cmd === "init") {
    const positional = rest.filter((s) => !s.startsWith("--"));
    const dry = rest.includes("--dry");
    const projectPath = resolve(positional[0] ?? ".");
    const r = await runInit({ projectPath, write: !dry });
    process.stdout.write(r.summary + "\n");
    return 0;
  }

  if (cmd === "suppress") {
    const positional = rest.filter((s) => !s.startsWith("--"));
    const reasonFlag = rest.find((s) => s.startsWith("--reason="));
    const reason = reasonFlag ? reasonFlag.slice("--reason=".length) : undefined;
    const id = positional[0];
    if (!id) {
      process.stderr.write("Usage: claude-guard suppress <finding_id> [path] [--reason=\"...\"]\n");
      return 1;
    }
    const projectPath = resolve(positional[1] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const target = findings.find((f) => f.id === id);
    if (!target) {
      process.stderr.write(`Finding not found: ${id}\n`);
      return 1;
    }
    const r = await suppressFinding(projectPath, target, reason);
    process.stdout.write(
      r.added
        ? `Added ${target.rule_id} @ ${target.file}:${target.range.startLine} to ${r.path}\n`
        : `No-op: ${r.reason ?? "already present"} at ${r.path}\n`
    );
    return 0;
  }

  if (cmd === "trend") {
    const projectPath = resolve(rest[0] ?? ".");
    const history = await loadHistory(projectPath);
    process.stdout.write(renderTrendMd(history));
    return 0;
  }

  if (cmd === "stats") {
    const projectPath = resolve(rest[0] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet. Run `claude-guard scan` first.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    process.stdout.write(JSON.stringify(summarize(findings), null, 2) + "\n");
    return 0;
  }

  if (cmd === "diff-scans") {
    const [a, b, ...tail] = rest;
    if (!a || !b) {
      process.stderr.write("Usage: claude-guard diff-scans <scan_id_before> <scan_id_after> [path]\n");
      return 1;
    }
    const projectPath = resolve(tail[0] ?? ".");
    const before = await loadFindings(projectPath, a);
    const after = await loadFindings(projectPath, b);
    const d = diffFindings(before, after);
    process.stdout.write(
      JSON.stringify(
        {
          before_scan_id: a,
          after_scan_id: b,
          introduced: d.introduced.length,
          resolved: d.resolved.length,
          unchanged: d.unchanged,
          introduced_list: d.introduced.map((f) => `${f.rule_id} @ ${f.file}:${f.range.startLine}`),
          resolved_list: d.resolved.map((f) => `${f.rule_id} @ ${f.file}:${f.range.startLine}`),
        },
        null,
        2
      ) + "\n"
    );
    return d.introduced.length > 0 ? 2 : 0;
  }

  if (cmd === "explain") {
    const id = rest[0];
    if (!id) {
      process.stderr.write("Usage: claude-guard explain <finding_id> [path]\n");
      return 1;
    }
    const projectPath = resolve(rest[1] ?? ".");
    const sid = await latestScanId(projectPath);
    if (!sid) {
      process.stderr.write("No scans yet.\n");
      return 1;
    }
    const findings = await loadFindings(projectPath, sid);
    const f = findings.find((x) => x.id === id);
    if (!f) {
      process.stderr.write(`Finding not found: ${id}\n`);
      return 1;
    }
    process.stdout.write(
      `# ${f.rule_id} — ${f.severity}\n\n${f.message}\n\nFile: ${f.file}:${f.range.startLine}\n\n${f.fix_hint ?? ""}\n`
    );
    return 0;
  }

  process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
  return 1;
}

async function latestScanId(project: string): Promise<string | null> {
  const scansDir = join(project, ".claude-guard/scans");
  if (!existsSync(scansDir)) return null;
  const scans = await globby("*/findings.json", { cwd: scansDir });
  if (scans.length === 0) return null;
  return scans.map((p) => p.split("/")[0]).sort().at(-1) ?? null;
}

async function loadFindings(project: string, sid: string): Promise<Finding[]> {
  const p = join(project, ".claude-guard/scans", sid, "findings.json");
  const j = JSON.parse(await readFile(p, "utf8")) as { findings: Finding[] };
  return j.findings;
}

async function openInBrowser(path: string): Promise<void> {
  const { spawn } = await import("child_process");
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
      ? "start"
      : "xdg-open";
  try {
    const proc = spawn(cmd, [path], { stdio: "ignore", detached: true });
    proc.unref();
  } catch {
    // non-fatal — user can still open the file manually
  }
}

async function runWatch(projectPath: string): Promise<void> {
  const { watch } = await import("fs");
  let running = false;
  let pending = false;
  let timer: NodeJS.Timeout | null = null;

  async function runOnce(reason: string): Promise<void> {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    const t0 = Date.now();
    try {
      const r = await scan(projectPath, { layers: ["l2"] });
      const card = scoreFindings(r.findings);
      const dur = Date.now() - t0;
      process.stdout.write(
        `[${new Date().toISOString()}] (${reason}) ${card.headline} · ${r.finding_count} findings · ${dur}ms\n`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`watch error: ${msg}\n`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        runOnce("queued");
      }
    }
  }

  await runOnce("initial");

  const skipDirs = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".claude-guard",
    "coverage",
  ]);
  const watcher = watch(
    projectPath,
    { recursive: true },
    (_event, filename) => {
      if (!filename) return;
      const top = String(filename).split(/[\\/]/)[0];
      if (skipDirs.has(top)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => runOnce(`changed: ${filename}`), 250);
    }
  );
  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });

  process.stdout.write(
    `watching ${projectPath} — press Ctrl+C to stop\n`
  );
  await new Promise(() => {});
}

main(process.argv.slice(2)).then((code) => {
  process.exit(code);
}).catch((err) => {
  process.stderr.write(`claude-guard error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
