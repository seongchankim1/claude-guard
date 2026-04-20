import type { Finding, Severity } from "./types.js";

export interface RuleStat {
  rule_id: string;
  severity: Severity;
  count: number;
  top_files: { file: string; hits: number }[];
}

export interface StatsReport {
  total_findings: number;
  distinct_rules: number;
  by_severity: Record<Severity, number>;
  by_category: Record<string, number>;
  top_rules: RuleStat[];
}

export function summarize(findings: Finding[]): StatsReport {
  const bySeverity: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  const byCategory: Record<string, number> = {};
  const perRule = new Map<
    string,
    { rule_id: string; severity: Severity; count: number; files: Map<string, number> }
  >();

  for (const f of findings) {
    bySeverity[f.severity] += 1;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    let bucket = perRule.get(f.rule_id);
    if (!bucket) {
      bucket = {
        rule_id: f.rule_id,
        severity: f.severity,
        count: 0,
        files: new Map(),
      };
      perRule.set(f.rule_id, bucket);
    }
    bucket.count += 1;
    bucket.files.set(f.file, (bucket.files.get(f.file) ?? 0) + 1);
  }

  const top_rules: RuleStat[] = [...perRule.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((b) => ({
      rule_id: b.rule_id,
      severity: b.severity,
      count: b.count,
      top_files: [...b.files.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([file, hits]) => ({ file, hits })),
    }));

  return {
    total_findings: findings.length,
    distinct_rules: perRule.size,
    by_severity: bySeverity,
    by_category: byCategory,
    top_rules,
  };
}
