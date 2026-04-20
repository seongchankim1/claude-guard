import { globby } from "globby";
import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { relative } from "path";
import type { Finding, RuleDef, RulePattern } from "../types.js";

const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.claude-guard/**",
  "**/coverage/**",
];

const PARALLEL_FILE_READ = 16;

export async function runL2(
  projectPath: string,
  rules: RuleDef[]
): Promise<Finding[]> {
  // Index files per unique glob set so we don't rescan the filesystem per rule.
  const globIndex = new Map<string, Promise<string[]>>();
  function filesFor(globs: string[]): Promise<string[]> {
    const key = globs.join("|");
    let existing = globIndex.get(key);
    if (!existing) {
      existing = globby(globs, {
        cwd: projectPath,
        absolute: true,
        dot: true,
        ignore: DEFAULT_IGNORES,
      });
      globIndex.set(key, existing);
    }
    return existing;
  }

  // Group patterns so we read each file at most once per distinct glob set.
  type Task = { rule: RuleDef; pattern: RulePattern; re: RegExp; files: string[] };
  const tasks: Task[] = [];
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const globs = pattern.files ?? ["**/*"];
      const files = await filesFor(globs);
      let re: RegExp;
      try {
        re = new RegExp(pattern.regex, "gms");
      } catch {
        continue; // malformed regex — already screened at load, skip defensively
      }
      tasks.push({ rule, pattern, re, files });
    }
  }

  const fileContentCache = new Map<string, Promise<string | null>>();
  function readOnce(abs: string): Promise<string | null> {
    let cached = fileContentCache.get(abs);
    if (cached) return cached;
    cached = readFile(abs, "utf8").then(
      (s) => s,
      () => null
    );
    fileContentCache.set(abs, cached);
    return cached;
  }

  const findings: Finding[] = [];
  for (const task of tasks) {
    for (let i = 0; i < task.files.length; i += PARALLEL_FILE_READ) {
      const slice = task.files.slice(i, i + PARALLEL_FILE_READ);
      const contents = await Promise.all(slice.map(readOnce));
      for (let j = 0; j < slice.length; j++) {
        const content = contents[j];
        if (content == null) continue;
        const abs = slice[j];
        task.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = task.re.exec(content)) !== null) {
          const { line, col } = offsetToLineCol(content, m.index);
          const lineText = extractLine(content, line);
          findings.push({
            id: randomUUID(),
            rule_id: task.rule.id,
            severity: task.rule.severity,
            category: task.rule.category,
            file: relative(projectPath, abs),
            range: {
              startLine: line,
              startCol: col,
              endLine: line,
              endCol: col + (m[0].split("\n")[0]?.length ?? m[0].length),
            },
            message: task.rule.title,
            evidence: lineText.trim().slice(0, 200),
            fix_hint: task.rule.context_hint,
            fix_strategy: task.rule.fix_strategy,
            source_engine: "l2",
            poc_template: task.rule.poc_template,
          });
          if (m[0].length === 0) task.re.lastIndex++;
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
