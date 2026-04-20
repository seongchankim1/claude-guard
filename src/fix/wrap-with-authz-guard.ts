import { Project, SyntaxKind, FunctionDeclaration } from "ts-morph";
import { join } from "path";
import type { Finding } from "../types.js";
import type { FixApplyResult } from "./index.js";

const GUARD_SNIPPET = [
  "const __session = await auth();",
  'if (!__session?.user) throw new Error("Unauthorized");',
];

export async function wrapWithAuthzGuard(
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

  const text = source.getFullText();
  if (!/^['\"]use server['\"]/.test(text.trimStart())) {
    return {
      finding_id: finding.id,
      status: "skipped",
      reason: "file is not a Server Actions module ('use server' missing)",
    };
  }

  const hasAuthImport = source
    .getImportDeclarations()
    .some((i) => /auth|getSession|getUser|currentUser/.test(i.getText()));

  if (!hasAuthImport) {
    const firstImport = source.getImportDeclarations()[0];
    const authImport = `import { auth } from "./auth";`;
    if (firstImport) {
      firstImport.replaceWithText(authImport + "\n" + firstImport.getText());
    } else {
      source.insertStatements(0, authImport);
    }
  }

  const fns = source.getFunctions().filter((fn) => fn.isExported() && fn.isAsync());
  let modified = 0;
  for (const fn of fns) {
    if (hasExistingGuard(fn)) continue;
    const body = fn.getBody();
    if (!body || !body.isKind(SyntaxKind.Block)) continue;
    const block = body.asKindOrThrow(SyntaxKind.Block);
    block.insertStatements(0, GUARD_SNIPPET);
    modified += 1;
  }

  if (modified === 0) {
    return {
      finding_id: finding.id,
      status: "skipped",
      reason: "no exported async server actions without an auth check found",
    };
  }

  await source.save();
  return {
    finding_id: finding.id,
    status: "applied",
    detail: `wrapped ${modified} server action(s) with auth guard`,
    touched: [abs],
  };
}

function hasExistingGuard(fn: FunctionDeclaration): boolean {
  const text = fn.getText();
  return /await\s+(auth|getSession|getUser|currentUser)\s*\(/.test(text);
}
