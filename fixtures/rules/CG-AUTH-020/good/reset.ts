import { randomBytes } from "crypto";
export function makeResetToken(): string {
  return randomBytes(32).toString("hex");
}
