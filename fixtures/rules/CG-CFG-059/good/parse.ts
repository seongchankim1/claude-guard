import { z } from "zod";
const Schema = z.object({ title: z.string(), body: z.string() });
export function parseBody(req: { body: unknown }) {
  return Schema.parse(req.body);
}
