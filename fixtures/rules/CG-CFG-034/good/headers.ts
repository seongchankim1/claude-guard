export function attach(res: any, req: any) {
  const raw = String(req.headers["x-forwarded-for"] ?? "");
  const cleaned = raw.replace(/[\r\n]/g, "");
  res.setHeader("X-Forwarded", cleaned);
}
