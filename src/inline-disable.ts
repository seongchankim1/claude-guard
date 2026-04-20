import { readFile } from "fs/promises";
import { join } from "path";
import type { Finding } from "./types.js";

interface DisableMap {
  fileLevelAll: boolean;
  fileLevelIds: Set<string>;
  lineIds: Map<number, Set<string>>;
  lineAll: Set<number>;
}

const FILE_CACHE = new Map<string, DisableMap>();

export async function filterByInlineDisables(
  projectPath: string,
  findings: Finding[]
): Promise<Finding[]> {
  FILE_CACHE.clear();
  const out: Finding[] = [];
  for (const f of findings) {
    const map = await loadForFile(projectPath, f.file);
    if (map.fileLevelAll) continue;
    if (map.fileLevelIds.has(f.rule_id)) continue;
    if (map.fileLevelIds.has("*")) continue;
    const lineIds = map.lineIds.get(f.range.startLine);
    if (map.lineAll.has(f.range.startLine)) continue;
    if (lineIds && (lineIds.has(f.rule_id) || lineIds.has("*"))) continue;
    out.push(f);
  }
  return out;
}

async function loadForFile(projectPath: string, file: string): Promise<DisableMap> {
  const cached = FILE_CACHE.get(file);
  if (cached) return cached;
  const abs = join(projectPath, file);
  let content = "";
  try {
    content = await readFile(abs, "utf8");
  } catch {
    const empty: DisableMap = {
      fileLevelAll: false,
      fileLevelIds: new Set(),
      lineIds: new Map(),
      lineAll: new Set(),
    };
    FILE_CACHE.set(file, empty);
    return empty;
  }

  const map: DisableMap = {
    fileLevelAll: false,
    fileLevelIds: new Set(),
    lineIds: new Map(),
    lineAll: new Set(),
  };
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fileMatch = line.match(/claude-guard-disable-file(?:\s+([A-Z0-9_\-*, ]+))?/);
    if (fileMatch) {
      const ids = parseIds(fileMatch[1]);
      if (ids.length === 0) map.fileLevelAll = true;
      else for (const id of ids) map.fileLevelIds.add(id);
    }
    const nextMatch = line.match(/claude-guard-disable-next-line(?:\s+([A-Z0-9_\-*, ]+))?/);
    if (nextMatch) {
      const ids = parseIds(nextMatch[1]);
      const target = i + 2; // i is 0-based, next source line is i+2 in 1-based
      if (ids.length === 0) map.lineAll.add(target);
      else {
        const set = map.lineIds.get(target) ?? new Set();
        for (const id of ids) set.add(id);
        map.lineIds.set(target, set);
      }
    }
    const sameLineMatch = line.match(/claude-guard-disable-line(?:\s+([A-Z0-9_\-*, ]+))?/);
    if (sameLineMatch) {
      const ids = parseIds(sameLineMatch[1]);
      const target = i + 1;
      if (ids.length === 0) map.lineAll.add(target);
      else {
        const set = map.lineIds.get(target) ?? new Set();
        for (const id of ids) set.add(id);
        map.lineIds.set(target, set);
      }
    }
  }
  FILE_CACHE.set(file, map);
  return map;
}

function parseIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
