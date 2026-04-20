import type { Scorecard } from "./scorecard.js";

export interface ShieldsBadge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
  namedLogo?: string;
}

const COLOR_BY_GRADE: Record<string, string> = {
  "A+": "brightgreen",
  A: "green",
  B: "yellowgreen",
  C: "yellow",
  D: "orange",
  F: "red",
};

export function scorecardToBadge(card: Scorecard): ShieldsBadge {
  return {
    schemaVersion: 1,
    label: "claude-guard",
    message: `${card.grade} · ${card.score}/100`,
    color: COLOR_BY_GRADE[card.grade] ?? "lightgrey",
  };
}
