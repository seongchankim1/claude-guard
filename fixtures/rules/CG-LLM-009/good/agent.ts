import { z } from "zod";
const Input = z.object({ verb: z.enum(["today", "yesterday"]) });
const ALLOW = new Set(["today", "yesterday"]);
export function handleToolUse(tool: { name: string; input: unknown }) {
  if (tool.name !== "ask_date") return null;
  const parsed = Input.parse(tool.input);
  if (!ALLOW.has(parsed.verb)) throw new Error("denied");
  return parsed.verb === "today" ? new Date() : new Date(Date.now() - 86400000);
}
