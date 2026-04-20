import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { Finding } from "../types.js";
import type { FixApplyResult } from "./index.js";

export async function suggestOnly(
  projectPath: string,
  finding: Finding
): Promise<FixApplyResult> {
  const abs = join(projectPath, finding.file);
  let content: string;
  try {
    content = await readFile(abs, "utf8");
  } catch {
    return {
      finding_id: finding.id,
      status: "failed",
      reason: `cannot read ${finding.file}`,
    };
  }
  const lines = content.split("\n");
  const idx = Math.max(0, finding.range.startLine - 1);
  const prefix = commentPrefix(finding.file);
  const marker = `${prefix} claude-guard: ${finding.rule_id} — ${finding.message.replace(/\n/g, " ")}. Manual review required.`;
  if (idx > 0 && lines[idx - 1]?.includes("claude-guard:")) {
    return {
      finding_id: finding.id,
      status: "suggested",
      detail: "already annotated",
      touched: [abs],
    };
  }
  lines.splice(idx, 0, marker);
  await writeFile(abs, lines.join("\n"));
  return {
    finding_id: finding.id,
    status: "suggested",
    detail: "inline annotation added",
    touched: [abs],
  };
}

function commentPrefix(file: string): string {
  if (/\.(py|rb|sh|yaml|yml)$/.test(file)) return "#";
  return "//";
}
