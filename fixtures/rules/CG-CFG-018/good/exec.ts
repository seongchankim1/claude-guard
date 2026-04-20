import { execFileSync } from "child_process";
const ALLOW = new Set(["ls", "date"]);
export function run(cmd: string) {
  if (!ALLOW.has(cmd)) throw new Error("denied");
  return execFileSync(cmd);
}
