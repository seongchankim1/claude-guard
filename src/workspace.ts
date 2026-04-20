import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const SUBDIRS = ["scans", "reports", "rollback", "redteam"];

export async function ensureWorkspace(projectPath: string): Promise<string> {
  const base = join(projectPath, ".claude-guard");
  await mkdir(base, { recursive: true });
  for (const s of SUBDIRS) await mkdir(join(base, s), { recursive: true });
  return base;
}

export async function ensureGitignore(projectPath: string): Promise<void> {
  const path = join(projectPath, ".gitignore");
  let content = "";
  if (existsSync(path)) content = await readFile(path, "utf8");
  if (/^\.claude-guard\/?$/m.test(content)) return;
  const trailing = content.endsWith("\n") || content === "" ? "" : "\n";
  await writeFile(path, content + trailing + ".claude-guard\n");
}
