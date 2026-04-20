import { detectBinary, runBinary } from "./detect.js";
import { randomUUID } from "crypto";
import type { Finding, Severity } from "../types.js";

export interface SemgrepRunResult {
  findings: Finding[];
  warning?: string;
}

/**
 * Runs Semgrep when opted-in. Uses `p/default` which is fetched from the
 * Semgrep registry — that's why it's NOT enabled by default (see config.ts).
 *
 * `requested = "enabled"` surfaces a warning if the binary is missing.
 * `requested = "auto"` is silent on missing binary.
 */
export async function runSemgrep(
  projectPath: string,
  requested: "auto" | "enabled" = "auto"
): Promise<SemgrepRunResult> {
  if (!(await detectBinary("semgrep"))) {
    if (requested === "enabled") {
      return {
        findings: [],
        warning:
          "engines.semgrep=enabled but `semgrep` is not on PATH — install it or set engines.semgrep=disabled",
      };
    }
    return { findings: [] };
  }
  const { stdout } = await runBinary(
    "semgrep",
    [
      "--config=p/default",
      "--json",
      "--quiet",
      "--timeout=120",
      "--metrics=off",
      projectPath,
    ],
    { timeoutMs: 240000 }
  );
  if (!stdout.trim()) return { findings: [] };
  let parsed: { results?: SemgrepResult[] };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { findings: [] };
  }
  const findings: Finding[] = [];
  for (const r of parsed.results ?? []) {
    findings.push({
      id: randomUUID(),
      rule_id: r.check_id ?? "semgrep.unknown",
      severity: mapSeverity(r.extra?.severity),
      category: "other",
      file: r.path ?? "",
      range: {
        startLine: r.start?.line ?? 1,
        startCol: r.start?.col ?? 1,
        endLine: r.end?.line ?? 1,
        endCol: r.end?.col ?? 1,
      },
      message: r.extra?.message ?? r.check_id ?? "semgrep finding",
      evidence: (r.extra?.lines ?? "").slice(0, 200),
      fix_hint: r.extra?.metadata?.references?.[0],
      fix_strategy: "suggest_only",
      source_engine: "semgrep",
    });
  }
  return { findings };
}

interface SemgrepResult {
  check_id?: string;
  path?: string;
  start?: { line?: number; col?: number };
  end?: { line?: number; col?: number };
  extra?: {
    message?: string;
    severity?: string;
    lines?: string;
    metadata?: { references?: string[] };
  };
}

function mapSeverity(s?: string): Severity {
  switch ((s ?? "").toUpperCase()) {
    case "ERROR":
      return "HIGH";
    case "WARNING":
      return "MEDIUM";
    case "INFO":
      return "LOW";
    case "CRITICAL":
      return "CRITICAL";
    default:
      return "MEDIUM";
  }
}
