import type { RuleDef, Category } from "./types.js";

const CATEGORY_TITLES: Record<Category, string> = {
  secrets: "Secrets",
  sql: "SQL / NoSQL injection",
  xss: "Cross-site scripting",
  auth: "Authentication & sessions",
  llm: "LLM / AI-specific risks",
  misconfig: "Misconfiguration",
  iac: "Infrastructure as code",
  docker: "Docker",
  other: "Other",
};

export function renderRulesCatalogMd(rules: RuleDef[]): string {
  const byCat = new Map<Category, RuleDef[]>();
  for (const r of rules) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }
  const lines: string[] = [];
  lines.push("# claude-guard rule catalogue");
  lines.push("");
  lines.push(`${rules.length} active builtin rules.`);
  lines.push("");
  for (const [cat, list] of byCat) {
    list.sort((a, b) => a.id.localeCompare(b.id));
    lines.push(`## ${CATEGORY_TITLES[cat] ?? cat} (${list.length})`);
    lines.push("");
    for (const r of list) {
      lines.push(`### ${r.id} — ${r.title}`);
      lines.push(`- **Severity:** ${r.severity}`);
      if (r.languages && r.languages.length > 0)
        lines.push(`- **Languages:** ${r.languages.join(", ")}`);
      lines.push(
        `- **Fix strategy:** \`${r.fix_strategy ?? "suggest_only"}\``
      );
      if (r.context_hint) {
        lines.push("");
        lines.push("> " + r.context_hint.trim().split("\n").join("\n> "));
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
