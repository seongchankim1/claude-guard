import { describe, it, expect } from "vitest";
import { validateTarget, isLoopback } from "../src/redteam/target-guard.js";

describe("redteam URL validator", () => {
  const ALLOW = [
    "http://localhost",
    "http://127.0.0.1:3000",
    "http://[::1]:8080",
    "http://0.0.0.0/x",
  ];
  for (const t of ALLOW) {
    it(`allows ${t}`, async () => {
      const r = await validateTarget(t);
      expect(r.ok, `Expected allow for ${t}`).toBe(true);
    });
  }

  const DENY = [
    "http://example.com",
    "https://8.8.8.8",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://172.16.0.1",
    "http://169.254.169.254",
    "ftp://localhost",
    "file:///etc/passwd",
    "http://localhost.evil.com",
    "http://[2001:db8::1]",
  ];
  for (const t of DENY) {
    it(`blocks ${t}`, async () => {
      const r = await validateTarget(t);
      expect(r.ok, `Should block ${t}`).toBe(false);
    });
  }

  it("isLoopback handles edge cases", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("127.255.255.255")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("0.0.0.0")).toBe(true);
    expect(isLoopback("10.0.0.1")).toBe(false);
    expect(isLoopback("2001:db8::1")).toBe(false);
    expect(isLoopback("garbage")).toBe(false);
  });
});
