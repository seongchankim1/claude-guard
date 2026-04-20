export function runUserExpr(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? 1 + n : null;
}
