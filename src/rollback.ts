import { existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

export type RollbackResult =
  | { ok: true; rollback_id: string; patch_path: string }
  | { ok: false; reason: string; patch_path?: string };

export function rollback(
  projectPath: string,
  rollback_id: string
): RollbackResult {
  const patch_path = join(
    projectPath,
    ".claude-guard/rollback",
    `${rollback_id}.patch`
  );
  if (!existsSync(patch_path)) {
    return { ok: false, reason: `ROLLBACK_NOT_FOUND: ${patch_path}` };
  }
  try {
    execSync(`git apply --reverse "${patch_path}"`, { cwd: projectPath });
    return { ok: true, rollback_id, patch_path };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `GIT_APPLY_FAILED: ${msg}`, patch_path };
  }
}
