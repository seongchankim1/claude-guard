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

  // Fail loud when the base ref doesn't exist. Without this check, a typo
  // like `--diff=main` on a `master` repo makes `git diff base...HEAD`
  // exit non-zero with empty stdout, and the scan silently filters down to
  // zero files — a "clean" report that actually skipped every change. For
  // a security scanner, that's the worst possible false negative.
  const baseCheck = await runBinary(
    "git",
    ["rev-parse", "--verify", "--quiet", `${base}^{commit}`],
    { cwd: projectPath, timeoutMs: 10000 }
  );
  if (baseCheck.code !== 0) {
    throw new Error(
      `DIFF_BAD_BASE: cannot resolve base ref "${base}" in this repo — pass a valid branch or commit (e.g. --diff=origin/main)`
    );
  }

  const headResult = await runBinary(
    "git",
    ["rev-parse", "HEAD"],
    { cwd: projectPath, timeoutMs: 10000 }
  );
  if (headResult.code !== 0) {
    throw new Error(
      `DIFF_NO_HEAD: git rev-parse HEAD failed — is this an empty repo? (${headResult.stderr.trim()})`
    );
  }
  const head = headResult.stdout.trim();

  const tripleDot = await runBinary(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`],
    { cwd: projectPath, timeoutMs: 30000 }
  );
  if (tripleDot.code !== 0) {
    throw new Error(
      `DIFF_FAILED: git diff ${base}...HEAD exited ${tripleDot.code}: ${tripleDot.stderr.trim()}`
    );
  }
  const wtree = await runBinary(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
    { cwd: projectPath, timeoutMs: 30000 }
  );
  if (wtree.code !== 0) {
    throw new Error(
      `DIFF_FAILED: git diff HEAD exited ${wtree.code}: ${wtree.stderr.trim()}`
    );
  }
  const untracked = await runBinary(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: projectPath, timeoutMs: 30000 }
  );
  if (untracked.code !== 0) {
    throw new Error(
      `DIFF_FAILED: git ls-files --others exited ${untracked.code}: ${untracked.stderr.trim()}`
    );
  }

  const files = new Set<string>();
  for (const s of [tripleDot.stdout, wtree.stdout, untracked.stdout]) {
    for (const line of s.split("\n")) {
      const t = line.trim();
      if (t) files.add(t);
    }
  }
  return { files: [...files].sort(), base, head };
}
