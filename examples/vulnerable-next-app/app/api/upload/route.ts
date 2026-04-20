// INTENTIONALLY VULNERABLE — for claude-guard demos only.
import { readFile } from "fs/promises";
import { join } from "path";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  // Path traversal (CG-CFG-012)
  return new Response(await readFile(join("uploads", name), "utf8"));
}
