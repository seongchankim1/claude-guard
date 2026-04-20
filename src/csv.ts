import type { Finding } from "./types.js";

const COLUMNS = [
  "rule_id",
  "severity",
  "category",
  "file",
  "line",
  "column",
  "message",
  "evidence",
  "fix_strategy",
  "source_engine",
] as const;

export function renderCsv(findings: Finding[]): string {
  const header = COLUMNS.join(",");
  const rows = findings.map((f) =>
    [
      f.rule_id,
      f.severity,
      f.category,
      f.file,
      f.range.startLine,
      f.range.startCol,
      f.message,
      f.evidence,
      f.fix_strategy ?? "",
      f.source_engine,
    ]
      .map(csvEscape)
      .join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}
