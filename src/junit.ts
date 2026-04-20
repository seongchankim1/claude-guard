import type { Finding } from "./types.js";

export function renderJunitXml(findings: Finding[]): string {
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const failures = findings.length;
  const suites = [...byFile.entries()].map(([file, list]) => {
    const cases = list
      .map(
        (f) => `    <testcase classname="${escapeXml(file)}" name="${escapeXml(f.rule_id + ":" + f.range.startLine)}">\n` +
          `      <failure type="${escapeXml(f.severity)}" message="${escapeXml(f.message)}">${escapeXml(f.evidence)}</failure>\n` +
          `    </testcase>`
      )
      .join("\n");
    return `  <testsuite name="${escapeXml(file)}" tests="${list.length}" failures="${list.length}">\n${cases}\n  </testsuite>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="claude-guard" tests="${failures}" failures="${failures}">
${suites}
</testsuites>
`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
