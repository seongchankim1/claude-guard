import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { Finding } from "./types.js";

export interface IgnoreEntry {
  rule_id?: string;
  file?: string;
  line?: number;
  reason?: string;
}

export interface IgnoreFile {
  ignore?: IgnoreEntry[];
}

export async function loadIgnore(projectPath: string): Promise<IgnoreEntry[]> {
  const path = join(projectPath, ".claude-guard", "ignore.yml");
  if (!existsSync(path)) return [];
  try {
    const raw = await readFile(path, "utf8");
    const parsed = yaml.load(raw) as IgnoreFile | null;
    return parsed?.ignore ?? [];
  } catch {
    return [];
  }
}

export function filterIgnored(
  findings: Finding[],
  ignore: IgnoreEntry[]
): Finding[] {
  if (ignore.length === 0) return findings;
  return findings.filter((f) => !matchesAny(f, ignore));
}

function matchesAny(f: Finding, entries: IgnoreEntry[]): boolean {
  for (const e of entries) {
    if (matches(f, e)) return true;
  }
  return false;
}

function matches(f: Finding, e: IgnoreEntry): boolean {
  if (e.rule_id && e.rule_id !== f.rule_id && !wildcardMatch(e.rule_id, f.rule_id)) return false;
  if (e.file && !pathMatch(e.file, f.file)) return false;
  if (typeof e.line === "number" && e.line !== f.range.startLine) return false;
  return (
    e.rule_id !== undefined ||
    e.file !== undefined ||
    typeof e.line === "number"
  );
}

function wildcardMatch(pattern: string, value: string): boolean {
  if (!pattern.includes("*")) return pattern === value;
  const re = new RegExp(
    "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
  );
  return re.test(value);
}

function pathMatch(pattern: string, value: string): boolean {
  if (pattern === value) return true;
  if (pattern.endsWith("/")) return value.startsWith(pattern);
  if (pattern.includes("*")) return wildcardMatch(pattern, value);
  return false;
}
