import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
export async function write(data: string) {
  const dir = await mkdtemp(join(tmpdir(), "upload-"));
  const p = join(dir, "data");
  await writeFile(p, data);
  return p;
}
