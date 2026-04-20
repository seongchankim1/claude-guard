export function preflight(res: any) {
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
