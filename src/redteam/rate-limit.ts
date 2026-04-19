const bucket: {
  minuteStart: number;
  count: number;
  perFinding: Map<string, number>;
} = {
  minuteStart: Date.now(),
  count: 0,
  perFinding: new Map(),
};

export function checkRate(finding_id: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  if (now - bucket.minuteStart > 60_000) {
    bucket.minuteStart = now;
    bucket.count = 0;
  }
  if (bucket.count >= 10) return { ok: false, reason: "RATE_MINUTE" };
  const prev = bucket.perFinding.get(finding_id) ?? 0;
  if (prev >= 1) return { ok: false, reason: "RATE_FINDING" };
  bucket.count += 1;
  bucket.perFinding.set(finding_id, prev + 1);
  return { ok: true };
}

export function resetRateLimitForTests(): void {
  bucket.minuteStart = Date.now();
  bucket.count = 0;
  bucket.perFinding.clear();
}
