import unzipper from "unzipper";
import { createReadStream } from "fs";
import { resolve } from "path";
export async function extractTo(src: string, destDir: string) {
  const base = resolve(destDir) + "/";
  const dir = await unzipper.Open.file(src);
  for (const entry of dir.files) {
    const target = resolve(destDir, entry.path);
    if (!target.startsWith(base)) throw new Error("zip-slip");
    if (entry.type === "File") {
      await new Promise<void>((r) =>
        entry.stream().pipe(createReadStream(target, { flags: "w" } as any)).on("finish", () => r())
      );
    }
  }
}
