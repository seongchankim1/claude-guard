const ALLOWED = new Set(["ls", "pwd"]);
export function invoke(tool_call: { cmd: string }) {
  if (!ALLOWED.has(tool_call.cmd)) throw new Error("denied");
  // safe branch elided for example
  return "";
}
