import { readFileSync } from "fs";
import { join } from "path";
export function render(req: { body: { name: string } }) {
  const tpl = readFileSync(join("prompts", req.body.name + ".md"), "utf8");
  return tpl;
}
