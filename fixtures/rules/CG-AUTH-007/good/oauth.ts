import { randomBytes } from "crypto";
export function makeState(): string {
  return randomBytes(16).toString("hex");
}
