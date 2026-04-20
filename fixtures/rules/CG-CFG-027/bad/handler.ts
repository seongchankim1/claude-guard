import type { Request, Response } from "express";
export function errorHandler(err: Error, _req: Request, res: Response) {
  res.status(500).json({ message: err.message, stack: err.stack });
}
