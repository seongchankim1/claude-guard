const ENABLED = process.stdout.isTTY && process.env.NO_COLOR !== "1" && process.env.TERM !== "dumb";

function wrap(open: string, close: string, s: string): string {
  return ENABLED ? `\x1b[${open}m${s}\x1b[${close}m` : s;
}

export const color = {
  enabled: ENABLED,
  bold: (s: string) => wrap("1", "22", s),
  dim: (s: string) => wrap("2", "22", s),
  red: (s: string) => wrap("31", "39", s),
  green: (s: string) => wrap("32", "39", s),
  yellow: (s: string) => wrap("33", "39", s),
  blue: (s: string) => wrap("34", "39", s),
  magenta: (s: string) => wrap("35", "39", s),
  cyan: (s: string) => wrap("36", "39", s),
  gray: (s: string) => wrap("90", "39", s),
};

export function severityColor(severity: string): (s: string) => string {
  switch (severity) {
    case "CRITICAL":
      return color.red;
    case "HIGH":
      return color.yellow;
    case "MEDIUM":
      return color.cyan;
    case "LOW":
      return color.gray;
    default:
      return (s) => s;
  }
}

export function gradeColor(grade: string): (s: string) => string {
  if (grade === "A+" || grade === "A") return color.green;
  if (grade === "B") return color.cyan;
  if (grade === "C") return color.yellow;
  return color.red;
}
