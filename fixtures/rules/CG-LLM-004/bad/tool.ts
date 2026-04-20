import { execSync } from "child_process";
export function invoke(tool_call: { cmd: string }) {
  return execSync(tool_call.cmd);
}
