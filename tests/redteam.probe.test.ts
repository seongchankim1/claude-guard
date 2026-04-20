import { describe, it, expect, beforeEach } from "vitest";
import { probe } from "../src/redteam/probe.js";
import { resetRateLimitForTests } from "../src/redteam/rate-limit.js";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("redteam probe", () => {
  beforeEach(() => resetRateLimitForTests());

  it("refuses external target via DNS rebinding defense", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await probe(dir, "http://example.com", "ext-test");
    expect(r.ok).toBe(false);
    expect(r.reason).toBeDefined();
  });

  it("refuses file:// protocol", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await probe(dir, "file:///etc/passwd", "proto-test");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("PROTOCOL");
  });

  it("rate limits repeated probes for the same finding", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    await probe(dir, "http://localhost:1/unused", "rate-test");
    const r2 = await probe(dir, "http://localhost:1/unused", "rate-test");
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("RATE_FINDING");
  });

  it("writes a log file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cg-"));
    const r = await probe(dir, "file:///etc/passwd", "log-test");
    expect(r.logPath).toContain("log-test.log");
  });
});
