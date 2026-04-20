import { z } from "zod";
const Schema = z.object({ answer: z.string() });
export function run(completion: string) {
  return Schema.parse(JSON.parse(completion));
}
