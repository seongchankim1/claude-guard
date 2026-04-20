export function attach(res: any, req: any) {
  res.setHeader("X-Forwarded", req.headers["x-forwarded-for"]);
}
