import { describe, it, expect } from "vitest";
import { loadBuiltinRules } from "../src/rules/loader.js";
import { runL2 } from "../src/engines/l2-native.js";
import { existsSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = resolve(here, "../fixtures/rules");

function listFixtureDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of readdirSync(cur)) {
      const p = join(cur, entry);
      const s = statSync(p);
      if (s.isDirectory()) stack.push(p);
      else if (s.isFile()) out.push(p);
    }
  }
  return out;
}

describe("rule fixtures", () => {
  it("every rule has at least one positive fixture (bad/)", async () => {
    const rules = await loadBuiltinRules();
    const missing: string[] = [];
    for (const r of rules) {
      const badDir = join(fixturesRoot, r.id, "bad");
      if (listFixtureDir(badDir).length === 0) missing.push(r.id);
    }
    expect(missing, `Missing bad fixtures for: ${missing.join(", ")}`).toEqual(
      []
    );
  });

  it("every 'bad' fixture triggers exactly its owning rule", async () => {
    const rules = await loadBuiltinRules();
    const failures: string[] = [];
    for (const r of rules) {
      const badDir = join(fixturesRoot, r.id, "bad");
      if (!existsSync(badDir)) continue;
      const findings = await runL2(badDir, rules);
      const hit = findings.some((f) => f.rule_id === r.id);
      if (!hit)
        failures.push(
          `${r.id} not triggered by its own bad fixture in ${badDir}`
        );
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("every 'good' fixture produces no finding for its owning rule", async () => {
    const rules = await loadBuiltinRules();
    const unexpected: string[] = [];
    for (const r of rules) {
      const goodDir = join(fixturesRoot, r.id, "good");
      if (!existsSync(goodDir)) continue;
      const findings = await runL2(goodDir, rules);
      const wrong = findings.find((f) => f.rule_id === r.id);
      if (wrong)
        unexpected.push(
          `${r.id} triggered by good fixture ${wrong.file}:${wrong.range.startLine}`
        );
    }
    expect(unexpected, unexpected.join("\n")).toEqual([]);
  });
});
