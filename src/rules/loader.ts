import { Ajv } from "ajv";
import { createRequire } from "module";
import { readFile } from "fs/promises";
import yaml from "js-yaml";
import { globby } from "globby";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import type { RuleDef } from "../types.js";
import schema from "../../schema/rule.schema.json" with { type: "json" };

const req = createRequire(import.meta.url);
const addFormats = req("ajv-formats") as (ajv: Ajv) => Ajv;
const safeRegex = req("safe-regex2") as (src: string | RegExp, opts?: { limit?: number }) => boolean;

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validator = ajv.compile(schema);

export function isRegexSafe(src: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new RegExp(src);
    return safeRegex(src, { limit: 25 });
  } catch {
    return false;
  }
}

export function validateRule(rule: unknown): string | null {
  if (!validator(rule)) {
    return ajv.errorsText(validator.errors);
  }
  const r = rule as unknown as RuleDef;
  for (const p of r.patterns) {
    if (!isRegexSafe(p.regex)) return `unsafe regex in ${r.id}: ${p.regex}`;
  }
  return null;
}

export async function loadRulesFromDir(dir: string): Promise<RuleDef[]> {
  const files = await globby(["**/*.yml", "**/*.yaml"], {
    cwd: dir,
    absolute: true,
  });
  const rules: RuleDef[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const raw = await readFile(f, "utf8");
    const parsed = yaml.load(raw);
    const err = validateRule(parsed);
    if (err) throw new Error(`Invalid rule in ${f}: ${err}`);
    const r = parsed as RuleDef;
    if (seen.has(r.id)) throw new Error(`Duplicate rule id: ${r.id}`);
    seen.add(r.id);
    rules.push(r);
  }
  return rules;
}

export async function loadBuiltinRules(): Promise<RuleDef[]> {
  const here = dirname(fileURLToPath(import.meta.url));
  const rulesDir = resolve(here, "../../rules");
  return loadRulesFromDir(rulesDir);
}
