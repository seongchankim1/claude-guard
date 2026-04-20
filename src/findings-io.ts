import { readFile } from "fs/promises";
import { join } from "path";
import { stat } from "fs/promises";
import { globby } from "globby";
import type { Finding } from "./types.js";
import type { PluginWarning, EngineWarning } from "./scan.js";

/**
 * Canonical shape of `.claude-guard/scans/<scan_id>/findings.json`.
 *
 * Kept in one place so the MCP resource, the MCP tools, and the CLI all
 * read the same fields — stops the drift codex flagged where some
 * surfaces propagate plugin/engine warnings and others silently drop them.
 */
export interface ScanArtifact {
  scan_id: string;
  created_at?: string;
  findings: Finding[];
  plugin_warnings?: PluginWarning[];
  engine_warnings?: EngineWarning[];
}

export async function loadScanArtifact(
  projectPath: string,
  scan_id: string
): Promise<ScanArtifact> {
  const p = join(projectPath, ".claude-guard/scans", scan_id, "findings.json");
  const raw = await readFile(p, "utf8");
  const parsed = JSON.parse(raw) as Partial<ScanArtifact>;
  return {
    scan_id: parsed.scan_id ?? scan_id,
    created_at: parsed.created_at,
    findings: parsed.findings ?? [],
    plugin_warnings: parsed.plugin_warnings,
    engine_warnings: parsed.engine_warnings,
  };
}

export async function latestScanId(projectPath: string): Promise<string | null> {
  try {
    const scansDir = join(projectPath, ".claude-guard/scans");
    const scans = await globby("*/findings.json", { cwd: scansDir });
    if (scans.length === 0) return null;
    // Sort by findings.json mtime — UUIDs aren't time-ordered,
    // so a lexicographic sort picks the wrong scan.
    const withMtime = await Promise.all(
      scans.map(async (rel) => {
        const id = rel.split("/")[0];
        const s = await stat(join(scansDir, rel));
        return { id, mtime: s.mtimeMs };
      })
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);
    return withMtime[0].id;
  } catch {
    return null;
  }
}
