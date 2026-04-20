import unzipper from "unzipper";
import { createReadStream } from "fs";
export function extractTo(src: string, dest: string) {
  return createReadStream(src).pipe(unzipper.Extract({ path: dest }));
}
