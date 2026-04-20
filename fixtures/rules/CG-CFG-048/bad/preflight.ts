export function preflight(res: any, req: any) {
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "");
}
