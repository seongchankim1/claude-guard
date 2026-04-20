#!/usr/bin/env node
import { scan } from "../scan.js";
import { renderFindingsMd } from "../findings-md.js";
import { loadBuiltinRules } from "../rules/loader.js";
import { scoreFindings, renderScorecardMd } from "../scorecard.js";
import { scorecardToBadge } from "../badge.js";
import { renderRulesCatalogMd } from "../rules-catalog.js";
import { findingsToSarif } from "../sarif.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { globby } from "globby";
import type { Finding } from "../types.js";

const HELP = `claude-guard — CLI
Usage:
  claude-guard scan [path]           Run scan (default: cwd)
  claude-guard list [path]           Render findings.md for latest scan
  claude-guard score [path]          Show grade/score for latest scan
  claude-guard badge [path]          Emit shields.io endpoint JSON for the latest scan
  claude-guard sarif [path]          Emit SARIF 2.1.0 for the latest scan (GitHub Code Scanning)
  claude-guard watch [path]          Rescan on file change (debounced)
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
    const projectPath = resolve(rest[0] ?? ".");
    const r = await scan(projectPath, { layers: ["l1", "l2"] });
    const card = scoreFindings(r.findings);
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
    return r.summary_by_severity.CRITICAL > 0 ? 2 : 0;
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
