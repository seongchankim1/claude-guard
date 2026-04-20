import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { scoreFindings, type Scorecard } from "./scorecard.js";
import type { Finding } from "./types.js";

export interface HistoryEntry {
  timestamp: string;
  scan_id: string;
  finding_count: number;
  scorecard: Scorecard;
  duration_ms: number;
}

export interface HistoryFile {
  entries: HistoryEntry[];
}

const MAX_ENTRIES = 100;

export async function recordScanHistory(
  projectPath: string,
  scan_id: string,
  findings: Finding[],
  duration_ms: number
): Promise<string> {
  const dir = join(projectPath, ".claude-guard");
  await mkdir(dir, { recursive: true });
  const path = join(dir, "history.json");

  let history: HistoryFile = { entries: [] };
  if (existsSync(path)) {
    try {
      history = JSON.parse(await readFile(path, "utf8")) as HistoryFile;
      if (!Array.isArray(history.entries)) history.entries = [];
    } catch {
      history = { entries: [] };
    }
  }

  history.entries.push({
    timestamp: new Date().toISOString(),
    scan_id,
    finding_count: findings.length,
    scorecard: scoreFindings(findings),
    duration_ms,
  });

  if (history.entries.length > MAX_ENTRIES) {
    history.entries = history.entries.slice(-MAX_ENTRIES);
  }

  await writeFile(path, JSON.stringify(history, null, 2));
  return path;
}

export async function loadHistory(projectPath: string): Promise<HistoryFile> {
  const path = join(projectPath, ".claude-guard/history.json");
  if (!existsSync(path)) return { entries: [] };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as HistoryFile;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

export function renderTrendMd(history: HistoryFile): string {
  if (history.entries.length === 0) {
    return "No scan history yet. Run `claude-guard scan` to populate.\n";
  }
  const lines: string[] = [];
  lines.push("# claude-guard scan history");
  lines.push("");
  lines.push("| when | grade | score | findings | duration |");
  lines.push("|---|---|---|---|---|");
  for (const e of history.entries.slice(-20).reverse()) {
    lines.push(
      `| ${e.timestamp} | ${e.scorecard.grade} | ${e.scorecard.score} | ${e.finding_count} | ${e.duration_ms}ms |`
    );
  }
  const first = history.entries[0];
  const last = history.entries[history.entries.length - 1];
  lines.push("");
  lines.push(
    `First run: ${first.timestamp} — Grade ${first.scorecard.grade} (${first.scorecard.score}/100).`
  );
  lines.push(
    `Latest:    ${last.timestamp} — Grade ${last.scorecard.grade} (${last.scorecard.score}/100).`
  );
  const delta = last.scorecard.score - first.scorecard.score;
  lines.push(
    `Delta:     ${delta >= 0 ? "+" : ""}${delta} points over ${history.entries.length} scan(s).`
  );
  return lines.join("\n") + "\n";
}
