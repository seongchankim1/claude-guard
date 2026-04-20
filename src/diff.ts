import { existsSync } from "fs";
import { join } from "path";
import { runBinary } from "./engines/detect.js";

export interface DiffFileSet {
  files: string[];
  base: string;
  head: string;
}

export async function changedFiles(
  projectPath: string,
  base: string
): Promise<DiffFileSet> {
  if (!existsSync(join(projectPath, ".git"))) {
    throw new Error("DIFF_NO_GIT: .git directory not found");
  }
  const headResult = await runBinary(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: projectPath, timeoutMs: 10000 }
  );
  const head = headResult.stdout.trim();

  const tripleDot = await runBinary(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`],
    { cwd: projectPath, timeoutMs: 30000 }
  );
  const wtree = await runBinary(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    { cwd: projectPath, timeoutMs: 30000 }
  );
  const untracked = await runBinary(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: projectPath, timeoutMs: 30000 }
  );

  const files = new Set<string>();
  for (const s of [tripleDot.stdout, wtree.stdout, untracked.stdout]) {
    for (const line of s.split("\n")) {
      const t = line.trim();
      if (t) files.add(t);
    }
  }
  return { files: [...files].sort(), base, head };
}
