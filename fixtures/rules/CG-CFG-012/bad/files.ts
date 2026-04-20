import { readFile } from "fs/promises";
import { join } from "path";
export async function handler(req: { params: { name: string } }) {
  return readFile(join("/var/data", req.params.name), "utf8");
}
