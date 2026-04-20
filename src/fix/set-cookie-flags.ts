import { Project, SyntaxKind, Node, CallExpression, ObjectLiteralExpression } from "ts-morph";
import { join } from "path";
import type { Finding } from "../types.js";
import type { FixApplyResult } from "./index.js";

const REQUIRED_FLAGS: Record<string, string> = {
  httpOnly: "true",
  secure: "true",
  sameSite: "'lax'",
};

export async function setCookieFlags(
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

  const targetLine = finding.range.startLine;
  let touched = false;
  let detail = "";

  source.forEachDescendant((node: Node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const call = node as CallExpression;
    const expr = call.getExpression().getText();
    if (!/cookies\(\)\.set$/.test(expr)) return;
    const { line } = source!.getLineAndColumnAtPos(call.getStart());
    if (line !== targetLine) return;

    const args = call.getArguments();
    let optionsObj: ObjectLiteralExpression | null = null;

    if (args.length === 1 && args[0].isKind(SyntaxKind.ObjectLiteralExpression)) {
      optionsObj = args[0] as ObjectLiteralExpression;
    } else if (args.length === 3 && args[2].isKind(SyntaxKind.ObjectLiteralExpression)) {
      optionsObj = args[2] as ObjectLiteralExpression;
    } else if (args.length === 2 && args[0].isKind(SyntaxKind.StringLiteral)) {
      const added = call.addArgument(
        `{ httpOnly: true, secure: true, sameSite: 'lax' }`
      );
      touched = true;
      detail = `added options object with ${Object.keys(REQUIRED_FLAGS).length} flags`;
      void added;
      return;
    }

    if (!optionsObj) return;

    const added: string[] = [];
    for (const [flag, value] of Object.entries(REQUIRED_FLAGS)) {
      const existing = optionsObj.getProperty(flag);
      if (!existing) {
        optionsObj.addPropertyAssignment({ name: flag, initializer: value });
        added.push(flag);
      }
    }
    if (added.length === 0) {
      detail = "all flags already set";
    } else {
      touched = true;
      detail = `added missing flags: ${added.join(", ")}`;
    }
  });

  if (!touched) {
    return {
      finding_id: finding.id,
      status: "skipped",
      reason: detail || "no matching cookies().set call found at target line",
    };
  }

  await source!.save();
  return {
    finding_id: finding.id,
    status: "applied",
    detail,
    touched: [abs],
  };
}
