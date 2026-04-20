import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";

export interface RollbackOptions {
  force?: boolean;
}

export type RollbackResult =
  | { ok: true; rollback_id: string; patch_path: string }
  | { ok: false; reason: string; patch_path?: string };

// rollback_id is the on-disk filename of the patch; tight allow-list so
// a malicious value can't traverse the filesystem or sneak shell metachars
// past execFileSync.
const ROLLBACK_ID_RE = /^[A-Za-z0-9._-]+$/;

export function rollback(
  projectPath: string,
  rollback_id: string,
  opts: RollbackOptions = {}
): RollbackResult {
  if (!ROLLBACK_ID_RE.test(rollback_id)) {
    return {
      ok: false,
      reason:
        "ROLLBACK_BAD_ID: rollback_id must match /^[A-Za-z0-9._-]+$/",
    };
  }

  const patch_path = join(
    projectPath,
    ".claude-guard/rollback",
    `${rollback_id}.patch`
  );
  if (!existsSync(patch_path)) {
    return { ok: false, reason: `ROLLBACK_NOT_FOUND: ${patch_path}` };
  }

  // Refuse to apply placeholder patches saved when the original apply_fixes
  // ran in dry_run mode or without git — "(no diff — ...)" isn't a real patch.
  const contents = readFileSync(patch_path, "utf8");
  if (contents.startsWith("(no diff")) {
    return {
      ok: false,
      reason:
        "ROLLBACK_PLACEHOLDER: this scan was dry-run or had no git — nothing to revert",
      patch_path,
    };
  }

  if (!existsSync(join(projectPath, ".git"))) {
    return {
      ok: false,
      reason: "ROLLBACK_NO_GIT: rollback requires a git repo",
      patch_path,
    };
  }

  // Real dirty-tree check. Previously we relied solely on `git apply --check`
  // which only detects *patch conflicts* — a dirty tree with unrelated edits
  // would quietly pass. We now refuse unless the tree is clean, matching
  // what the CLI help has been claiming.
  if (!opts.force) {
    let dirty = "";
    try {
      dirty = execFileSync("git", ["status", "--porcelain"], {
        cwd: projectPath,
        stdio: ["ignore", "pipe", "pipe"],
      }).toString();
    } catch {
      dirty = "";
    }
    if (dirty.trim().length > 0) {
      return {
        ok: false,
        reason:
          "ROLLBACK_DIRTY_TREE: commit or stash changes first, or pass force=true — rolling back over a dirty tree risks data loss",
        patch_path,
      };
    }

    // Also pre-flight the reverse-apply so obvious conflicts (e.g. the fix
    // has already been hand-reverted) surface before we mutate anything.
    try {
      execFileSync(
        "git",
        ["apply", "--check", "--reverse", patch_path],
        { cwd: projectPath, stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        reason: `ROLLBACK_WOULD_CONFLICT: the current tree state would cause merge conflicts on reverse-apply — pass force=true to attempt anyway. Detail: ${msg
          .split("\n")
          .slice(0, 2)
          .join(" ")}`,
        patch_path,
      };
    }
  }

  try {
    execFileSync("git", ["apply", "--reverse", patch_path], {
      cwd: projectPath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, rollback_id, patch_path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `GIT_APPLY_FAILED: ${msg}`, patch_path };
  }
}

