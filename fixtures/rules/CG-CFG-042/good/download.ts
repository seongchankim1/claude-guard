import type { Request, Response } from "express";
import { resolve } from "path";
const BASE = resolve("/var/uploads");
export function download(req: Request, res: Response) {
  const abs = resolve(BASE, req.params.file);
  if (!abs.startsWith(BASE + "/")) return res.sendStatus(404);
  res.set("X-Content-Type-Options", "nosniff");
  res.sendFile(abs);
}
