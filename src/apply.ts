import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import { applyFix } from "./fix/index.js";
import { parseCheckedIds } from "./findings-md.js";
import type { Finding } from "./types.js";

export interface ApplyOptions {
  scan_id: string;
  force?: boolean;
  mode?: "checked" | "all_safe" | "dry_run";
}

export interface ApplyResult {
  applied: string[];
  suggested: string[];
  skipped: string[];
  failed: { finding_id: string; reason?: string }[];
  diff_path: string;
  rollback_path: string;
  branch: string;
  mode: "checked" | "all_safe" | "dry_run";
}

export async function applyFixes(
  projectPath: string,
  opts: ApplyOptions
): Promise<ApplyResult> {
  const mode = opts.mode ?? "checked";
  const gitDir = join(projectPath, ".git");
  const hasGit = existsSync(gitDir);

  if (hasGit && mode !== "dry_run") {
    const git = simpleGit(projectPath);
    const status = await git.status();
    if (!opts.force && !status.isClean()) {
      throw new Error(
        "WORKING_TREE_DIRTY: commit or stash changes, or pass force=true"
      );
    }
  }

  const scanPath = join(
    projectPath,
    ".claude-guard/scans",
    opts.scan_id,
    "findings.json"
  );
  const { findings } = JSON.parse(await readFile(scanPath, "utf8")) as {
    findings: Finding[];
  };

  let chosen: Finding[] = [];
  if (mode === "all_safe") {
    chosen = findings.filter((f) => f.fix_strategy === "rename_env_var");
  } else {
    const mdPath = join(projectPath, ".claude-guard/findings.md");
    let md = "";
    try {
      md = await readFile(mdPath, "utf8");
    } catch {
      md = "";
    }
    const ids = new Set(parseCheckedIds(md));
    chosen = findings.filter((f) => ids.has(f.id));
  }

  let branch = "claude-guard/dry-run";
  if (hasGit && mode !== "dry_run") {
    const git = simpleGit(projectPath);
    branch = `claude-guard/fix-${opts.scan_id.slice(0, 8)}`;
    const branches = await git.branchLocal();
    if (!branches.all.includes(branch)) {
      await git.checkoutLocalBranch(branch);
    } else {
      await git.checkout(branch);
    }
  }

  const applied: string[] = [];
  const suggested: string[] = [];
  const skipped: string[] = [];
  const failed: { finding_id: string; reason?: string }[] = [];

  if (mode === "dry_run") {
    for (const f of chosen) skipped.push(f.id);
  } else {
    for (const f of chosen) {
      const r = await applyFix(projectPath, f);
      if (r.status === "applied") applied.push(f.id);
      else if (r.status === "suggested") suggested.push(f.id);
      else if (r.status === "failed")
        failed.push({ finding_id: f.id, reason: r.reason });
      else skipped.push(f.id);
    }
  }

  const rollbackDir = join(projectPath, ".claude-guard/rollback");
  await mkdir(rollbackDir, { recursive: true });
  const rollback_path = join(rollbackDir, `${opts.scan_id}.patch`);

  let diff = "";
  if (hasGit && mode !== "dry_run") {
    const git = simpleGit(projectPath);
    diff = await git.diff();
    await writeFile(rollback_path, diff);
    if (applied.length || suggested.length) await git.add(["-A"]);
  } else {
    await writeFile(rollback_path, "(no diff — dry_run or no git)\n");
  }

  const diff_path = rollback_path;
  return {
    applied,
    suggested,
    skipped,
    failed,
    diff_path,
    rollback_path,
    branch,
    mode,
  };
}
