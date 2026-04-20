import type { Request, Response } from "express";
import { randomUUID } from "crypto";
export function errorHandler(err: Error, _req: Request, res: Response) {
  const id = randomUUID();
  console.error(`[${id}]`, err);
  res.status(500).json({ error: "internal", correlationId: id });
}
