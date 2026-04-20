export function check(req: { headers: Record<string, string> }, expected: string) {
  const signature = req.headers["x-signature"];
  if (signature === expected) return true;
  return false;
}
