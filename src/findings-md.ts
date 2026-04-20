import type { Finding, Severity } from "./types.js";
import { scoreFindings, renderScorecardMd } from "./scorecard.js";

const ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export function renderFindingsMd(scan_id: string, findings: Finding[]): string {
  const grouped: Record<Severity, Finding[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  for (const f of findings) grouped[f.severity].push(f);

  const lines: string[] = [];
  lines.push(`# claude-guard findings — scan_id: ${scan_id}`);
  lines.push("");
  const card = scoreFindings(findings);
  lines.push(renderScorecardMd(card));
  lines.push(
    "> Toggle `[ ]` → `[x]` for items you want fixed. Run `apply_fixes` after saving."
  );
  lines.push(
    "> HTML comments hold the finding id — do not modify them."
  );
  lines.push("");

  for (const sev of ORDER) {
    if (grouped[sev].length === 0) continue;
    lines.push(`## ${sev} (${grouped[sev].length})`);
    lines.push("");
    for (const f of grouped[sev]) {
      lines.push(
        `- [ ] <!-- finding_id: ${f.id} --> **${f.rule_id}** \`${f.file}:${f.range.startLine}\` — ${f.message}`
      );
      if (f.fix_strategy) {
        lines.push(`  - strategy: \`${f.fix_strategy}\``);
      }
      if (f.fix_hint) {
        const firstHint = f.fix_hint.split("\n").find((l) => l.trim().length > 0);
        if (firstHint) lines.push(`  - hint: ${firstHint.trim()}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function parseCheckedIds(md: string): string[] {
  const ids: string[] = [];
  const re = /^\s*-\s*\[[xX]\]\s*<!--\s*finding_id:\s*([^\s]+)\s*-->/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) ids.push(m[1]);
  return ids;
}
