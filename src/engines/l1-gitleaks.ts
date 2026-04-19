import { detectBinary, runBinary } from "./detect.js";
import { randomUUID } from "crypto";
import type { Finding } from "../types.js";
import { existsSync } from "fs";
import { join } from "path";

interface GitleaksFinding {
  RuleID?: string;
  Description?: string;
  File?: string;
  StartLine?: number;
  StartColumn?: number;
  EndLine?: number;
  EndColumn?: number;
  Match?: string;
}

export async function runGitleaks(projectPath: string): Promise<Finding[]> {
  if (!(await detectBinary("gitleaks"))) return [];
  if (!existsSync(join(projectPath, ".git"))) return [];
  const { stdout } = await runBinary(
    "gitleaks",
    [
      "detect",
      "--source",
      projectPath,
      "--report-format",
      "json",
      "--report-path",
      "-",
      "--redact",
      "--exit-code",
      "0",
    ],
    { timeoutMs: 180000 }
  );
  if (!stdout.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed) ? (parsed as GitleaksFinding[]) : [];
  return arr.map<Finding>((r) => ({
    id: randomUUID(),
    rule_id: `gitleaks.${r.RuleID ?? "unknown"}`,
    severity: "CRITICAL",
    category: "secrets",
    file: r.File ?? "",
    range: {
      startLine: r.StartLine ?? 1,
      startCol: r.StartColumn ?? 1,
      endLine: r.EndLine ?? 1,
      endCol: r.EndColumn ?? 1,
    },
    message: r.Description ?? "Secret detected in git history",
    evidence: (r.Match ?? "[redacted]").slice(0, 200),
    source_engine: "gitleaks",
    fix_strategy: "suggest_only",
  }));
}
