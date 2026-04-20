import type { Finding, RuleDef, Severity } from "./types.js";

export interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: { driver: SarifDriver };
  results: SarifResult[];
}

interface SarifDriver {
  name: string;
  version: string;
  informationUri: string;
  rules: SarifRule[];
}

interface SarifRule {
  id: string;
  name?: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  defaultConfiguration: { level: "error" | "warning" | "note" };
  helpUri?: string;
  properties: { category: string; severity: Severity };
}

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: [SarifLocation];
  partialFingerprints?: { primaryLocationLineHash: string };
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: {
      startLine: number;
      startColumn?: number;
      endLine?: number;
      endColumn?: number;
      snippet?: { text: string };
    };
  };
}

const SEVERITY_TO_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "note",
};

import { createRequire } from "module";
const req = createRequire(import.meta.url);

function readOwnVersion(): string {
  try {
    const pkg = req("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function findingsToSarif(
  findings: Finding[],
  rules: RuleDef[],
  version = readOwnVersion()
): SarifLog {
  const usedRuleIds = new Set(findings.map((f) => f.rule_id));
  const sarifRules: SarifRule[] = rules
    .filter((r) => usedRuleIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.id,
      shortDescription: { text: r.title },
      fullDescription: r.context_hint
        ? { text: r.context_hint.trim() }
        : undefined,
      defaultConfiguration: { level: SEVERITY_TO_LEVEL[r.severity] },
      properties: { category: r.category, severity: r.severity },
    }));

  // Include a minimal stub rule for engine-origin findings (Semgrep, Gitleaks)
  // whose rule_id is not in our builtin catalogue.
  for (const id of usedRuleIds) {
    if (sarifRules.some((r) => r.id === id)) continue;
    const sample = findings.find((f) => f.rule_id === id)!;
    sarifRules.push({
      id,
      name: id,
      shortDescription: { text: sample.message },
      defaultConfiguration: { level: SEVERITY_TO_LEVEL[sample.severity] },
      properties: { category: sample.category, severity: sample.severity },
    });
  }

  const results: SarifResult[] = findings.map((f) => ({
    ruleId: f.rule_id,
    level: SEVERITY_TO_LEVEL[f.severity],
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.file.replace(/\\/g, "/") },
          region: {
            startLine: f.range.startLine,
            startColumn: f.range.startCol,
            endLine: f.range.endLine,
            endColumn: f.range.endCol,
            snippet: { text: f.evidence.slice(0, 200) },
          },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: `${f.rule_id}:${f.file}:${f.range.startLine}`,
    },
  }));

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "claude-guard",
            version,
            informationUri: "https://github.com/seongchankim1/claude-guard",
            rules: sarifRules,
          },
        },
        results,
      },
    ],
  };
}
