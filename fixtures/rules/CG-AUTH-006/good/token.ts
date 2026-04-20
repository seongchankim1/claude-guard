import { randomBytes } from "crypto";
export function newToken(): string {
  return randomBytes(32).toString("hex");
}
