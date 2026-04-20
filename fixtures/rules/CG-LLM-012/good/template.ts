import { readFileSync } from "fs";
import { join } from "path";
const ALLOW = { summarize: "prompts/summarize.md", classify: "prompts/classify.md" } as const;
type Key = keyof typeof ALLOW;
export function render(key: Key) {
  return readFileSync(join(ALLOW[key]), "utf8");
}
