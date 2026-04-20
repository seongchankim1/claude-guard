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

  // Cross-rule precision: a 'good' fixture designed to be clean for rule X
  // should not get cross-fired on by some *other* rule Y. Known inter-rule
  // overlaps are listed in ALLOWED_CROSSFIRE so they don't mask novel drift.
  it("cross-rule precision: other rules don't fire on unrelated good fixtures", async () => {
    const rules = await loadBuiltinRules();
    // Pairs where we accept a cross-fire because both rules legitimately
    // flag the same pattern. Format: "<good-fixture-owner>::<firing-rule>".
    // Each entry has a one-line justification.
    const ALLOWED_CROSSFIRE = new Set<string>([
      // CG-CFG-005 ("Express without helmet") is an advisory on every
      // express() app. Any good fixture that creates an Express app will
      // trip it — that's the rule's intent, not a bug.
      "CG-AUTH-018::CG-CFG-005",
      "CG-CFG-026::CG-CFG-005",
      "CG-CFG-028::CG-CFG-005",
      "CG-CFG-040::CG-CFG-005",
      "CG-CFG-045::CG-CFG-005",
      // CG-AUTH-002 ("cookies().set without flags") is an advisory on every
      // cookies().set call. Good fixtures using cookies().set with proper
      // flags still legitimately surface for review — proper flag-presence
      // verification needs AST, not regex, and is tracked as follow-up work.
      "CG-AUTH-016::CG-AUTH-002",
      "CG-CFG-039::CG-AUTH-002",
      "CG-CFG-053::CG-AUTH-002",
      // CG-AUTH-010 ("credential in URL") catches reset-link URLs that
      // include `token=...`. A password-reset flow using a URL-embedded
      // token is a real leak vector (referrer, logs). Both rules are
      // right to flag.
      "CG-AUTH-022::CG-AUTH-010",
      "CG-CFG-031::CG-AUTH-010",
      // CG-SEC-006 ("real .env committed") fires on any non-.example .env
      // with values. CG-SEC-001's good fixture is such a file (with
      // non-secret placeholder values). Expected overlap.
      "CG-SEC-001::CG-SEC-006",
      // CG-LLM-001 ("user input in system prompt") has overlapping
      // concerns with CG-LLM-013 (RAG docs in system). Both flag the
      // same anti-pattern from different angles.
      "CG-LLM-013::CG-LLM-001",
      // CG-XSS-009 ("JSX href={expr} without scheme guard") legitimately
      // fires on CG-XSS-005's good fixture which uses href={href} — the
      // rel=noopener fixes the tabnabbing concern but not the scheme one.
      "CG-XSS-005::CG-XSS-009",
    ]);
    const crossfires: string[] = [];
    for (const r of rules) {
      const goodDir = join(fixturesRoot, r.id, "good");
      if (!existsSync(goodDir)) continue;
      const findings = await runL2(goodDir, rules);
      for (const f of findings) {
        if (f.rule_id === r.id) continue; // owning-rule case is handled above
        const pairKey = `${r.id}::${f.rule_id}`;
        if (ALLOWED_CROSSFIRE.has(pairKey)) continue;
        crossfires.push(
          `${f.rule_id} fired on ${r.id}'s good fixture ${f.file}:${f.range.startLine}`
        );
      }
    }
    expect(
      crossfires,
      "Cross-rule false positives found. Tighten the offending rule's regex, or add the pair to ALLOWED_CROSSFIRE with justification.\n" +
        crossfires.join("\n")
    ).toEqual([]);
  });
});
