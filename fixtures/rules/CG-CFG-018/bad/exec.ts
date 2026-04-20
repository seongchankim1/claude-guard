import { execSync } from "child_process";
export function run(req: { body: { cmd: string } }) {
  return execSync(req.body.cmd);
}
