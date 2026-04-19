import { readFile, writeFile } from "fs/promises";
import { globby } from "globby";
import type { Finding } from "../types.js";
import type { FixApplyResult } from "./index.js";

export async function renameEnvVar(
  projectPath: string,
  finding: Finding
): Promise<FixApplyResult> {
  const match = finding.evidence.match(/(NEXT_PUBLIC_[A-Z0-9_]+)/);
  if (!match) {
    return {
      finding_id: finding.id,
      status: "failed",
      reason: "no NEXT_PUBLIC name found in evidence",
    };
  }
  const oldName = match[1];
  const newName = oldName.replace(/^NEXT_PUBLIC_/, "");
  const files = await globby(
    [
      ".env*",
      "**/*.js",
      "**/*.ts",
      "**/*.jsx",
      "**/*.tsx",
      "**/*.mjs",
      "**/*.cjs",
    ],
    {
      cwd: projectPath,
      absolute: true,
      dot: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/.claude-guard/**",
      ],
    }
  );
  const changed: string[] = [];
  for (const f of files) {
    const original = await readFile(f, "utf8");
    if (!original.includes(oldName)) continue;
    const updated = original.split(oldName).join(newName);
    await writeFile(f, updated);
    changed.push(f);
  }
  if (changed.length === 0) {
    return {
      finding_id: finding.id,
      status: "failed",
      reason: `${oldName} not found in any source file`,
    };
  }
  return {
    finding_id: finding.id,
    status: "applied",
    detail: `renamed ${oldName} -> ${newName} in ${changed.length} files`,
    touched: changed,
  };
}
