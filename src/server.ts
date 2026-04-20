import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
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
import { renderDefaultConfigYaml, loadConfig } from "./config.js";
import { scoreFindings } from "./scorecard.js";
import { findingsToSarif } from "./sarif.js";
import type { Finding } from "./types.js";

const scanArgs = z.object({
  project_path: z.string(),
  layers: z.array(z.enum(["l1", "l2"])).optional(),
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
  force: z.boolean().optional(),
});
const probeArgs = z.object({
  project_path: z.string(),
  target: z.string(),
  finding_id: z.string(),
});
const initArgs = z.object({ project_path: z.string() });
const initConfigArgs = z.object({
  project_path: z.string(),
  force: z.boolean().optional(),
});
const listChecksArgs = z.object({
  project_path: z.string().optional(),
  verbose: z.boolean().optional(),
});

import { loadScanArtifact, latestScanId } from "./findings-io.js";

// Track the most recent project_path used by any tool call so that resource
// reads (`claude-guard://latest/...`) resolve against the SAME project the
// client just scanned, not process.cwd() / an env var. Without this the
// resource URIs often return "No scans yet" even right after a successful
// scan, because the server was launched in a different directory.
let lastProject: string | null = null;

async function loadFindings(
  project: string,
  scan_id: string
): Promise<Finding[]> {
  const a = await loadScanArtifact(project, scan_id);
  return a.findings;
}

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }] };
}

export function buildServer() {
  const server = new Server(
    { name: "claude-guard", version: "2.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  );

  // Prompts (show up as slash commands in Claude Code: /mcp__claude-guard__<name>)
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "scan",
        description:
          "Scan the current project for security issues and render the checkbox findings file. One-shot audit entry point.",
        arguments: [
          {
            name: "project_path",
            description:
              "Absolute path to scan. Defaults to the last project or the current working directory.",
            required: false,
          },
        ],
      },
      {
        name: "fix",
        description:
          "Apply the AST-backed safe fixes for items checked in .claude-guard/findings.md.",
        arguments: [
          {
            name: "project_path",
            description: "Absolute path of the project. Defaults to last scanned.",
            required: false,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, string>;
    const path =
      args.project_path ?? lastProject ?? process.env.CLAUDE_GUARD_PROJECT ?? process.cwd();

    if (name === "scan") {
      return {
        description: "Run a claude-guard scan and surface the findings.",
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Run the claude-guard \`scan\` tool against \`${path}\` with the default layers, then call \`list_findings\` on the same path so the checkbox markdown is written. After that, summarize the grade, the severity breakdown, and the top 5 most critical findings. Do not apply any fixes yet — the user will tick the items they want fixed and call the \`fix\` prompt.`,
            },
          },
        ],
      };
    }

    if (name === "fix") {
      return {
        description: "Apply the fixes the user ticked in findings.md.",
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Read \`.claude-guard/findings.md\` under \`${path}\`. For every item the user has ticked with [x], call the claude-guard \`apply_fixes\` tool in \`checked\` mode with the current \`scan_id\`. Report which fixes were applied vs skipped vs failed, name the fix branch it wrote to, and point the user at the rollback command.`,
            },
          },
        ],
      };
    }

    throw new Error(`Unknown prompt: ${name}`);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "claude-guard://latest/findings.md",
        name: "claude-guard findings (markdown checklist, latest scan)",
        mimeType: "text/markdown",
      },
      {
        uri: "claude-guard://latest/findings.json",
        name: "claude-guard findings (raw JSON, latest scan)",
        mimeType: "application/json",
      },
      {
        uri: "claude-guard://latest/scorecard.json",
        name: "claude-guard scorecard (A+..F grade, latest scan)",
        mimeType: "application/json",
      },
      {
        uri: "claude-guard://rules/catalog.md",
        name: "claude-guard active rule catalogue",
        mimeType: "text/markdown",
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    // Prefer the last scanned project — a scan tool call during this
    // session has remembered the right path. Fall back to env / cwd for
    // clients that call resources before any tool.
    const cwd =
      lastProject ?? process.env.CLAUDE_GUARD_PROJECT ?? process.cwd();
    if (uri === "claude-guard://rules/catalog.md") {
      const { renderRulesCatalogMd } = await import("./rules-catalog.js");
      const rules = await loadBuiltinRules();
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: renderRulesCatalogMd(rules),
          },
        ],
      };
    }
    const sid = await latestScanId(cwd);
    if (!sid) {
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: "No scans yet. Run the `scan` tool first.",
          },
        ],
      };
    }
    const artifact = await loadScanArtifact(cwd, sid);
    const findings = artifact.findings;
    if (uri === "claude-guard://latest/findings.md") {
      const md = renderFindingsMd(sid, findings);
      return {
        contents: [{ uri, mimeType: "text/markdown", text: md }],
      };
    }
    if (uri === "claude-guard://latest/findings.json") {
      // Return the canonical artifact so MCP clients see plugin/engine warnings
      // too, not just the raw findings list.
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(artifact, null, 2),
          },
        ],
      };
    }
    if (uri === "claude-guard://latest/scorecard.json") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(scoreFindings(findings), null, 2),
          },
        ],
      };
    }
    throw new Error(`Unknown resource URI: ${uri}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "scan",
        description:
          "Scan a project for security findings. L1 orchestrates external tools if they are on PATH (semgrep, gitleaks). L2 runs the built-in YAML rules. The red-team probe is a separate opt-in tool (redteam_probe), not a scan layer. Writes findings to .claude-guard/scans/<scan_id>/findings.json.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: {
              type: "string",
              description: "Absolute path to the project to scan.",
            },
            layers: {
              type: "array",
              items: { type: "string", enum: ["l1", "l2"] },
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
          "Detect the project's stack and write .claude-guard/config.yaml with smart defaults. Refuses to overwrite an existing config unless force=true — so repeat calls never lose a team's severity_overrides / plugin allowlist.",
        inputSchema: {
          type: "object",
          properties: {
            project_path: { type: "string" },
            force: {
              type: "boolean",
              description:
                "Overwrite an existing .claude-guard/config.yaml.",
            },
          },
          required: ["project_path"],
        },
      },
      {
        name: "score",
        description:
          "Compute a security grade (A+/A/B/C/D/F) for the latest scan.",
        inputSchema: {
          type: "object",
          properties: { project_path: { type: "string" } },
          required: ["project_path"],
        },
      },
      {
        name: "export_sarif",
        description:
          "Emit SARIF 2.1.0 for the latest scan — upload to GitHub Code Scanning or another SARIF consumer.",
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
        lastProject = a.project_path;
        const r = await scan(a.project_path, { layers: a.layers });
        return text(
          JSON.stringify(
            {
              scan_id: r.scan_id,
              finding_count: r.finding_count,
              duration_ms: r.duration_ms,
              layers_run: r.layers_run,
              summary_by_severity: r.summary_by_severity,
              // Surface warnings so MCP clients notice config/plugin problems
              // without having to read the raw findings.json.
              plugin_warnings: r.plugin_warnings,
              engine_warnings: r.engine_warnings,
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
        lastProject = a.project_path;
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
        const { rollback } = await import("./rollback.js");
        const r = rollback(a.project_path, a.rollback_id, { force: a.force });
        return text(JSON.stringify(r, null, 2));
      }
      if (name === "redteam_probe") {
        const a = probeArgs.parse(args);
        // Opt-in gate: config.redteam.enabled must be true.
        const cfg = await loadConfig(a.project_path);
        if (!cfg.redteam?.enabled) {
          return text(
            JSON.stringify(
              {
                ok: false,
                reason: "REDTEAM_DISABLED",
                hint: "Set redteam.enabled: true in .claude-guard/config.yaml to opt in. See SECURITY_MODEL.md for guardrails.",
              },
              null,
              2
            )
          );
        }
        const r = await probe(a.project_path, a.target, a.finding_id);
        return text(JSON.stringify(r, null, 2));
      }
      if (name === "list_checks") {
        const a = listChecksArgs.parse(args);
        // When a project path is provided, include plugin rules the project
        // has allow-listed — otherwise show the builtin catalog only.
        let rules = await loadBuiltinRules();
        let plugin_warnings: { plugin: string; message: string }[] = [];
        if (a.project_path) {
          const cfg = await loadConfig(a.project_path);
          const { loadAllRules } = await import("./rules/plugin-loader.js");
          const all = await loadAllRules(
            a.project_path,
            loadBuiltinRules,
            cfg.plugins.allowed
          );
          rules = all.rules;
          plugin_warnings = all.plugin_warnings;
        }
        if (a.verbose)
          return text(
            JSON.stringify(
              {
                rules: rules.map((r) => ({
                  id: r.id,
                  title: r.title,
                  severity: r.severity,
                  category: r.category,
                })),
                plugin_warnings:
                  plugin_warnings.length > 0 ? plugin_warnings : undefined,
              },
              null,
              2
            )
          );
        const byCat: Record<string, number> = {};
        for (const r of rules)
          byCat[r.category] = (byCat[r.category] ?? 0) + 1;
        const warn =
          plugin_warnings.length > 0
            ? `\n\nPlugin warnings:\n${plugin_warnings
                .map((w) => `- [${w.plugin}] ${w.message}`)
                .join("\n")}`
            : "";
        return text(
          `Total rules: ${rules.length}\n${Object.entries(byCat)
            .sort((a, b) => b[1] - a[1])
            .map(([c, n]) => `- ${c}: ${n}`)
            .join("\n")}${warn}`
        );
      }
      if (name === "init_config") {
        const a = initConfigArgs.parse(args);
        const p = join(a.project_path, ".claude-guard/config.yaml");
        if (existsSync(p) && !a.force) {
          return text(
            JSON.stringify(
              {
                ok: false,
                reason: "CONFIG_EXISTS",
                path: p,
                hint: "Existing .claude-guard/config.yaml holds your severity_overrides / plugin allowlist. Pass force=true to overwrite, or edit the file by hand.",
              },
              null,
              2
            )
          );
        }
        // Delegate to the stack-aware CLI initializer so MCP users get the
        // same Next.js / Supabase / Prisma-aware overrides as CLI users.
        const { runInit } = await import("./init.js");
        const r = await runInit({ projectPath: a.project_path, write: true });
        return text(JSON.stringify({ ok: true, ...r }, null, 2));
      }
      if (name === "score") {
        const a = initArgs.parse(args);
        const sid = await latestScanId(a.project_path);
        if (!sid) return text("No scans yet. Run the `scan` tool first.");
        const findings = await loadFindings(a.project_path, sid);
        const card = scoreFindings(findings);
        return text(JSON.stringify(card, null, 2));
      }
      if (name === "export_sarif") {
        const a = initArgs.parse(args);
        const sid = await latestScanId(a.project_path);
        if (!sid) return text("No scans yet. Run the `scan` tool first.");
        const findings = await loadFindings(a.project_path, sid);
        const cfg = await loadConfig(a.project_path);
        const { loadAllRules } = await import("./rules/plugin-loader.js");
        const { rules } = await loadAllRules(
          a.project_path,
          loadBuiltinRules,
          cfg.plugins.allowed
        );
        const sarif = findingsToSarif(findings, rules);
        const outDir = join(a.project_path, ".claude-guard");
        await mkdir(outDir, { recursive: true });
        const outPath = join(outDir, "findings.sarif");
        await writeFile(outPath, JSON.stringify(sarif, null, 2));
        return text(
          `Wrote ${outPath}\n\nUpload to GitHub Code Scanning with:\n  gh api repos/:owner/:repo/code-scanning/sarifs -X POST -F sarif=@${outPath} -F ref=refs/heads/main -F commit_sha=$(git rev-parse HEAD)`
        );
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
