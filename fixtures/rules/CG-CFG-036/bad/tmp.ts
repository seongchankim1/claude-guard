import { writeFileSync } from "fs";
export function write(data: string) {
  const p = `/tmp/upload-${Math.random().toString(36).slice(2)}`;
  writeFileSync(p, data);
  return p;
}
