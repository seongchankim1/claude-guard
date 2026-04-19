import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { scan } from "./scan.js";
import { renderFindingsMd } from "./findings-md.js";
import { applyFixes } from "./apply.js";
import { loadBuiltinRules } from "./rules/loader.js";
import { renderStaticPoc } from "./redteam/static-poc.js";
import { probe } from "./redteam/probe.js";
import { renderDefaultConfigYaml } from "./config.js";
import type { Finding } from "./types.js";

const scanArgs = z.object({
  project_path: z.string(),
  layers: z.array(z.enum(["l1", "l2", "l3"])).optional(),
});
const listArgs = z.object({
  project_path: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  category: z.string().optional(),
});
const explainArgs = z.object({
  project_path: z.string(),
  finding_id: z.string(),
});
const applyArgs = z.object({
  project_path: z.string(),
  scan_id: z.string(),
  mode: z.enum(["checked", "all_safe", "dry_run"]).optional(),
  force: z.boolean().optional(),
});
const rollbackArgs = z.object({
  project_path: z.string(),
  rollback_id: z.string(),
});
const probeArgs = z.object({
  project_path: z.string(),
  target: z.string(),
  finding_id: z.string(),
});
const initArgs = z.object({ project_path: z.string() });
const listChecksArgs = z.object({
  project_path: z.string().optional(),
  verbose: z.boolean().optional(),
});

async function loadFindings(
  project: string,
  scan_id: string
): Promise<Finding[]> {
  const p = join(project, ".claude-guard/scans", scan_id, "findings.json");
  const j = JSON.parse(await readFile(p, "utf8")) as { findings: Finding[] };
  return j.findings;
}

async function latestScanId(project: string): Promise<string | null> {
  try {
    const { globby } = await import("globby");
    const scans = await globby("*/findings.json", {
      cwd: join(project, ".claude-guard/scans"),
    });
    if (scans.length === 0) return null;
    return scans.map((p) => p.split("/")[0]).sort().at(-1)!;
  } catch {
    return null;
  }
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export function buildServer() {
  const server = new Server(
    { name: "claude-guard", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "scan",
        description:
          "Scan a project for security findings across layered engines (L1 external tools if present, L2 builtin rules, L3 red-team). Writes findings to .claude-guard/scans/<scan_id>/findings.json.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: {
              type: "string",
              description: "Absolute path to the project to scan.",
            },
            layers: {
              type: "array",
              items: { type: "string", enum: ["l1", "l2", "l3"] },
            },
          },
          required: ["project_path"],
        },
      },
      {
        name: "list_findings",
        description:
          "Render a checkbox markdown view of the latest scan to .claude-guard/findings.md. Toggle [x] on items you want fixed, then call apply_fixes.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            severity: {
              type: "string",
              enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
            },
            category: { type: "string" },
          },
          required: ["project_path"],
        },
      },
      {
        name: "explain",
        description:
          "Explain a specific finding: rule rationale, attack scenario, PoC payload, and fix guidance.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            finding_id: { type: "string" },
          },
          required: ["project_path", "finding_id"],
        },
      },
      {
        name: "apply_fixes",
        description:
          "Apply fixes for findings checked in findings.md (mode=checked, default) or all safe autofixes (mode=all_safe). Creates a claude-guard/fix-<scan_id> branch.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            scan_id: { type: "string" },
            mode: {
              type: "string",
              enum: ["checked", "all_safe", "dry_run"],
            },
            force: { type: "boolean" },
          },
          required: ["project_path", "scan_id"],
        },
      },
      {
        name: "rollback",
        description:
          "Revert a previously applied fix batch by reverse-applying its saved patch.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            rollback_id: { type: "string" },
          },
          required: ["project_path", "rollback_id"],
        },
      },
      {
        name: "redteam_probe",
        description:
          "Loopback-only (127.0.0.1/localhost/::1/0.0.0.0) live probe against a running local server. External targets are hard-blocked.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            target: { type: "string" },
            finding_id: { type: "string" },
          },
          required: ["project_path", "target", "finding_id"],
        },
      },
      {
        name: "list_checks",
        description:
          "List active rules grouped by category (default: summary; verbose=true for full list).",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            verbose: { type: "boolean" },
          },
        },
      },
      {
        name: "init_config",
        description:
          "Write .claude-guard/config.yaml with defaults (safe to run repeatedly).",
        inputSchema: {
          type: "object",
          properties: { project_path: { type: "string" } },
          required: ["project_path"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    try {
      if (name === "scan") {
        const a = scanArgs.parse(args);
        const r = await scan(a.project_path, { layers: a.layers });
        return text(
          JSON.stringify(
            {
              scan_id: r.scan_id,
              finding_count: r.finding_count,
              duration_ms: r.duration_ms,
              layers_run: r.layers_run,
              summary_by_severity: r.summary_by_severity,
              next_step:
                "Run list_findings to render .claude-guard/findings.md, toggle [x] on items to fix, then apply_fixes.",
            },
            null,
            2
          )
        );
      }
      if (name === "list_findings") {
        const a = listArgs.parse(args);
        const sid = await latestScanId(a.project_path);
        if (!sid)
          return text("No scans yet. Run the `scan` tool first.");
        const findings = (await loadFindings(a.project_path, sid))
          .filter((f) => !a.severity || f.severity === a.severity)
          .filter((f) => !a.category || f.category === a.category);
        const md = renderFindingsMd(sid, findings);
        const out = join(a.project_path, ".claude-guard/findings.md");
        await writeFile(out, md);
        return text(md);
      }
      if (name === "explain") {
        const a = explainArgs.parse(args);
        const sid = await latestScanId(a.project_path);
        if (!sid) return text("No scans yet.");
        const f = (await loadFindings(a.project_path, sid)).find(
          (x) => x.id === a.finding_id
        );
        if (!f) return text("Finding not found.");
        const poc = renderStaticPoc(f);
        return text(
          `# ${f.rule_id} — ${f.severity}\n\n${f.message}\n\nFile: ${f.file}:${f.range.startLine}\n\n${f.fix_hint ?? ""}\n\n## Proof of concept\n\n${poc}\n`
        );
      }
      if (name === "apply_fixes") {
        const a = applyArgs.parse(args);
        const r = await applyFixes(a.project_path, {
          scan_id: a.scan_id,
          mode: a.mode,
          force: a.force,
        });
        return text(JSON.stringify(r, null, 2));
      }
      if (name === "rollback") {
        const a = rollbackArgs.parse(args);
        const patchPath = join(
          a.project_path,
          ".claude-guard/rollback",
          `${a.rollback_id}.patch`
        );
        if (!existsSync(patchPath))
          return text(`Rollback patch not found: ${patchPath}`);
        const { execSync } = await import("child_process");
        try {
          execSync(`git apply --reverse "${patchPath}"`, {
            cwd: a.project_path,
          });
          return text(`Rolled back ${a.rollback_id}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return text(`Rollback failed: ${msg}`);
        }
      }
      if (name === "redteam_probe") {
        const a = probeArgs.parse(args);
        const r = await probe(a.project_path, a.target, a.finding_id);
        return text(JSON.stringify(r, null, 2));
      }
      if (name === "list_checks") {
        const a = listChecksArgs.parse(args);
        const rules = await loadBuiltinRules();
        if (a.verbose)
          return text(
            JSON.stringify(
              rules.map((r) => ({
                id: r.id,
                title: r.title,
                severity: r.severity,
                category: r.category,
              })),
              null,
              2
            )
          );
        const byCat: Record<string, number> = {};
        for (const r of rules)
          byCat[r.category] = (byCat[r.category] ?? 0) + 1;
        return text(
          `Total rules: ${rules.length}\n${Object.entries(byCat)
            .sort((a, b) => b[1] - a[1])
            .map(([c, n]) => `- ${c}: ${n}`)
            .join("\n")}`
        );
      }
      if (name === "init_config") {
        const a = initArgs.parse(args);
        await mkdir(join(a.project_path, ".claude-guard"), {
          recursive: true,
        });
        const p = join(a.project_path, ".claude-guard/config.yaml");
        await writeFile(p, renderDefaultConfigYaml());
        return text(`Wrote ${p}`);
      }
      return text(`Unknown tool: ${name}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return text(`Error: ${msg}`);
    }
  });

  return server;
}

export async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
