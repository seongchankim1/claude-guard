import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import type { Finding } from "./types.js";

export interface SuppressionEntry {
  rule_id?: string;
  file?: string;
  line?: number;
  reason?: string;
}

export interface SuppressResult {
  path: string;
  added: boolean;
  reason?: string;
}

export async function suppressFinding(
  projectPath: string,
  finding: Finding,
  reason?: string
): Promise<SuppressResult> {
  const dir = join(projectPath, ".claude-guard");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "ignore.yml");

  let existing: { ignore?: SuppressionEntry[] } = { ignore: [] };
  if (existsSync(path)) {
    try {
      const raw = await readFile(path, "utf8");
      existing = (yaml.load(raw) as typeof existing) ?? { ignore: [] };
      existing.ignore = existing.ignore ?? [];
    } catch {
      existing = { ignore: [] };
    }
  }

  const entry: SuppressionEntry = {
    rule_id: finding.rule_id,
    file: finding.file,
    line: finding.range.startLine,
    ...(reason ? { reason } : {}),
  };

  const dupe = existing.ignore!.some(
    (e) =>
      e.rule_id === entry.rule_id &&
      e.file === entry.file &&
      e.line === entry.line
  );
  if (dupe) {
    return { path, added: false, reason: "already suppressed" };
  }

  existing.ignore!.push(entry);
  await writeFile(path, yaml.dump(existing));
  return { path, added: true };
}
