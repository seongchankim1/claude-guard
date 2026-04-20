import { execSync } from "child_process";
export function handleToolUse(tool: { name: string; input: { cmd: string } }) {
  if (tool.name === "tool_use_run") {
    return execSync(tool.input.cmd);
  }
}
