import { readFile } from "fs/promises";
import { resolve } from "path";
const BASE = "/var/data";
export async function handler(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "";
  const abs = resolve(BASE, name);
  if (!abs.startsWith(BASE + "/")) throw new Error("bad path");
  return readFile(abs, "utf8");
}
