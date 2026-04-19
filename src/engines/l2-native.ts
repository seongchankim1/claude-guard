import { globby } from "globby";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { relative } from "path";
import type { Finding, RuleDef } from "../types.js";

const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.claude-guard/**",
  "**/coverage/**",
];

export async function runL2(
  projectPath: string,
  rules: RuleDef[]
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const globs = pattern.files ?? ["**/*"];
      const files = await globby(globs, {
        cwd: projectPath,
        absolute: true,
        dot: true,
        ignore: DEFAULT_IGNORES,
      });
      const re = new RegExp(pattern.regex, "gms");
      for (const abs of files) {
        let content: string;
        try {
          content = await readFile(abs, "utf8");
        } catch {
          continue;
        }
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          const { line, col } = offsetToLineCol(content, m.index);
          const lineText = extractLine(content, line);
          findings.push({
            id: randomUUID(),
            rule_id: rule.id,
            severity: rule.severity,
            category: rule.category,
            file: relative(projectPath, abs),
            range: {
              startLine: line,
              startCol: col,
              endLine: line,
              endCol: col + (m[0].split("\n")[0]?.length ?? m[0].length),
            },
            message: rule.title,
            evidence: lineText.trim().slice(0, 200),
            fix_hint: rule.context_hint,
            fix_strategy: rule.fix_strategy,
            source_engine: "l2",
            poc_template: rule.poc_template,
          });
          if (m[0].length === 0) re.lastIndex++;
        }
      }
    }
  }
  return dedupe(findings);
}

function offsetToLineCol(content: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function extractLine(content: string, lineNumber: number): string {
  const lines = content.split("\n");
  return lines[lineNumber - 1] ?? "";
}

export function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const k = `${f.file}:${f.range.startLine}:${f.rule_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
