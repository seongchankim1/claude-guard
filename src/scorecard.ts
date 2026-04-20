import type { Finding, Severity } from "./types.js";

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

export interface Scorecard {
  score: number;
  grade: Grade;
  deductions: Record<Severity, number>;
  finding_counts: Record<Severity, number>;
  headline: string;
}

const WEIGHTS: Record<Severity, number> = {
  CRITICAL: 20,
  HIGH: 8,
  MEDIUM: 3,
  LOW: 1,
};

const CAP: Record<Severity, number> = {
  CRITICAL: 80,
  HIGH: 40,
  MEDIUM: 20,
  LOW: 10,
};

export function scoreFindings(findings: Finding[]): Scorecard {
  const counts: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  for (const f of findings) counts[f.severity]++;

  const deductions: Record<Severity, number> = {
    CRITICAL: Math.min(CAP.CRITICAL, counts.CRITICAL * WEIGHTS.CRITICAL),
    HIGH: Math.min(CAP.HIGH, counts.HIGH * WEIGHTS.HIGH),
    MEDIUM: Math.min(CAP.MEDIUM, counts.MEDIUM * WEIGHTS.MEDIUM),
    LOW: Math.min(CAP.LOW, counts.LOW * WEIGHTS.LOW),
  };
  const totalDeduction =
    deductions.CRITICAL +
    deductions.HIGH +
    deductions.MEDIUM +
    deductions.LOW;
  const score = Math.max(0, 100 - totalDeduction);
  const grade = toGrade(score, counts.CRITICAL);
  const headline = buildHeadline(grade, score, counts);
  return { score, grade, deductions, finding_counts: counts, headline };
}

function toGrade(score: number, criticals: number): Grade {
  if (criticals > 0 && score > 60) return "D";
  if (score >= 95) return "A+";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "F";
}

function buildHeadline(
  grade: Grade,
  score: number,
  counts: Record<Severity, number>
): string {
  const parts: string[] = [];
  if (counts.CRITICAL) parts.push(`${counts.CRITICAL} CRITICAL`);
  if (counts.HIGH) parts.push(`${counts.HIGH} HIGH`);
  if (counts.MEDIUM) parts.push(`${counts.MEDIUM} MEDIUM`);
  if (counts.LOW) parts.push(`${counts.LOW} LOW`);
  const tail = parts.length ? ` (${parts.join(", ")})` : "";
  return `Grade ${grade} — score ${score}/100${tail}`;
}

export function renderScorecardMd(card: Scorecard): string {
  const lines: string[] = [];
  lines.push(`> **Security scorecard:** ${card.headline}`);
  lines.push(">");
  lines.push(
    "> | severity | findings | deduction |"
  );
  lines.push(
    "> |---|---|---|"
  );
  for (const sev of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[]) {
    lines.push(
      `> | ${sev} | ${card.finding_counts[sev]} | -${card.deductions[sev]} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}
