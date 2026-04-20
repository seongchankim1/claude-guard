import { writeFile, mkdir, chmod, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const HOOK_HEADER = "# installed by claude-guard — scans only staged files vs HEAD";
const HOOK_MARKER = "claude-guard pre-commit";

const HOOK_BODY = `#!/usr/bin/env bash
set -euo pipefail

# ${HOOK_MARKER}
# Block commits that introduce CRITICAL findings in staged files.
# Skip with: git commit --no-verify

if command -v npx >/dev/null 2>&1; then
  SCAN="npx --no -y -p claude-guard-mcp claude-guard scan --diff=HEAD"
else
  echo "claude-guard pre-commit: npx not found, skipping" >&2
  exit 0
fi

OUT=$($SCAN 2>&1 || true)
CRIT=$(printf '%s' "$OUT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const m=d.match(/\\"CRITICAL\\":\\s*(\\d+)/);process.stdout.write((m?m[1]:'0'))}catch{process.stdout.write('0')}})")

if [ "\${CRIT:-0}" -gt 0 ]; then
  echo ""
  echo "claude-guard pre-commit: $CRIT CRITICAL finding(s) in staged files. Commit blocked."
  echo "Run \\"claude-guard list\\" to review, then either fix, ignore with .claude-guard/ignore.yml,"
  echo "or commit with --no-verify if you know what you're doing."
  exit 1
fi
exit 0
`;

export interface InstallHooksResult {
  path: string;
  wrote: boolean;
  reason?: string;
}

export async function installGitHook(projectPath: string): Promise<InstallHooksResult> {
  const gitDir = join(projectPath, ".git");
  if (!existsSync(gitDir)) {
    return { path: "", wrote: false, reason: "not a git repo — .git not found" };
  }
  const hooksDir = join(gitDir, "hooks");
  await mkdir(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, "pre-commit");

  let existing = "";
  if (existsSync(hookPath)) {
    existing = await readFile(hookPath, "utf8");
    if (existing.includes(HOOK_MARKER)) {
      return { path: hookPath, wrote: false, reason: "claude-guard hook already installed" };
    }
    // preserve existing non-claude-guard hook by chaining
    const combined =
      `#!/usr/bin/env bash\nset -euo pipefail\n\n${HOOK_HEADER}\n\n# --- claude-guard ---\n` +
      HOOK_BODY.replace(/^#!\/usr\/bin\/env bash\n/, "").replace(/^set -euo pipefail\n/, "") +
      `\n# --- existing hook preserved below ---\n` +
      existing.replace(/^#!.*\n/, "") +
      "\n";
    await writeFile(hookPath, combined, { mode: 0o755 });
    await chmod(hookPath, 0o755);
    return { path: hookPath, wrote: true, reason: "chained before existing pre-commit hook" };
  }

  await writeFile(hookPath, HOOK_BODY, { mode: 0o755 });
  await chmod(hookPath, 0o755);
  return { path: hookPath, wrote: true };
}
