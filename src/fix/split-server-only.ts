import { Project } from "ts-morph";
import { join } from "path";
import type { Finding } from "../types.js";
import type { FixApplyResult } from "./index.js";

export async function splitServerOnly(
  projectPath: string,
  finding: Finding
): Promise<FixApplyResult> {
  const abs = join(projectPath, finding.file);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });
  let source;
  try {
    source = project.addSourceFileAtPath(abs);
  } catch {
    return {
      finding_id: finding.id,
      status: "failed",
      reason: `cannot parse ${finding.file}`,
    };
  }

  const existing = source.getImportDeclarations();
  const already = existing.some(
    (imp) => imp.getModuleSpecifierValue() === "server-only"
  );
  if (already) {
    return {
      finding_id: finding.id,
      status: "skipped",
      reason: `server-only already imported`,
    };
  }

  source.insertStatements(0, `import "server-only";`);
  await source.save();
  return {
    finding_id: finding.id,
    status: "applied",
    detail: `prepended import "server-only" to ${finding.file}`,
    touched: [abs],
  };
}
