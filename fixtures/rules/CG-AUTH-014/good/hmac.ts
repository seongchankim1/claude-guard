import { timingSafeEqual } from "crypto";
export function check(received: string, expected: string): boolean {
  const a = Buffer.from(received, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
