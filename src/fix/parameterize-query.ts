import {
  Project,
  SyntaxKind,
  Node,
  CallExpression,
  TemplateExpression,
  NoSubstitutionTemplateLiteral,
  StringLiteral,
} from "ts-morph";
import { join } from "path";
import type { Finding } from "../types.js";
import type { FixApplyResult } from "./index.js";

export async function parameterizeQuery(
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
  const rewrites: { from: string; to: string }[] = [];

  source.forEachDescendant((node: Node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const call = node as CallExpression;
    const expr = call.getExpression();
    const exprText = expr.getText();
    if (!/\$(queryRawUnsafe|executeRawUnsafe)$/.test(exprText)) return;
    const { line } = source!.getLineAndColumnAtPos(call.getStart());
    if (Math.abs(line - targetLine) > 2) return;

    const args = call.getArguments();
    if (args.length === 0) return;
    const first = args[0];

    let newCallText: string | null = null;
    const newMethod = exprText.replace(/Unsafe$/, "");

    if (first.isKind(SyntaxKind.TemplateExpression)) {
      const tmpl = first as TemplateExpression;
      newCallText = `${newMethod}${tmpl.getText()}`;
    } else if (first.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
      const tmpl = first as NoSubstitutionTemplateLiteral;
      newCallText = `${newMethod}${tmpl.getText()}`;
    } else if (first.isKind(SyntaxKind.StringLiteral) && args.length > 1) {
      const tmpl = first as StringLiteral;
      const restArgs = args.slice(1).map((a) => a.getText());
      const raw = tmpl.getLiteralText();
      let i = 0;
      const parameterized = raw.replace(/\$\d+|\?/g, () => {
        const r = restArgs[i] ?? "undefined";
        i += 1;
        return `\${${r}}`;
      });
      newCallText = `${newMethod}\`${parameterized}\``;
    } else {
      return;
    }

    if (!newCallText) return;
    const before = call.getText();
    call.replaceWithText(newCallText);
    rewrites.push({ from: before, to: newCallText });
    touched = true;
  });

  if (!touched) {
    return {
      finding_id: finding.id,
      status: "skipped",
      reason: "no Unsafe-form Prisma call found near target line",
    };
  }

  await source!.save();
  return {
    finding_id: finding.id,
    status: "applied",
    detail: `rewrote ${rewrites.length} Unsafe call(s) to tagged template form`,
    touched: [abs],
  };
}
