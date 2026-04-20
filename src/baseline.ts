import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import type { Finding } from "./types.js";

export interface BaselineFile {
  created_at: string;
  scan_id: string;
  fingerprints: string[];
}

export function fingerprint(f: Finding): string {
  const evidence = f.evidence.trim().replace(/\s+/g, " ").slice(0, 80);
  return `${f.rule_id}|${f.file}|${evidence}`;
}

export async function captureBaseline(
  projectPath: string,
  scanId: string,
  findings: Finding[]
): Promise<string> {
  const baseline: BaselineFile = {
    created_at: new Date().toISOString(),
    scan_id: scanId,
    fingerprints: [...new Set(findings.map(fingerprint))].sort(),
  };
  const path = join(projectPath, ".claude-guard", "baseline.json");
  await mkdir(join(projectPath, ".claude-guard"), { recursive: true });
  await writeFile(path, JSON.stringify(baseline, null, 2));
  return path;
}

export async function loadBaseline(projectPath: string): Promise<BaselineFile | null> {
  const path = join(projectPath, ".claude-guard", "baseline.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as BaselineFile;
  } catch {
    return null;
  }
}

export function filterAgainstBaseline(
  findings: Finding[],
  baseline: BaselineFile
): { new_findings: Finding[]; suppressed: number } {
  const known = new Set(baseline.fingerprints);
  const new_findings: Finding[] = [];
  let suppressed = 0;
  for (const f of findings) {
    if (known.has(fingerprint(f))) {
      suppressed += 1;
    } else {
      new_findings.push(f);
    }
  }
  return { new_findings, suppressed };
}

export interface DiffResult {
  introduced: Finding[];
  resolved: Finding[];
  unchanged: number;
}

export function diffFindings(
  before: Finding[],
  after: Finding[]
): DiffResult {
  const beforeMap = new Map<string, Finding>();
  for (const f of before) beforeMap.set(fingerprint(f), f);
  const afterMap = new Map<string, Finding>();
  for (const f of after) afterMap.set(fingerprint(f), f);

  const introduced: Finding[] = [];
  const resolved: Finding[] = [];
  let unchanged = 0;

  for (const [k, f] of afterMap) {
    if (beforeMap.has(k)) unchanged += 1;
    else introduced.push(f);
  }
  for (const [k, f] of beforeMap) {
    if (!afterMap.has(k)) resolved.push(f);
  }
  return { introduced, resolved, unchanged };
}
