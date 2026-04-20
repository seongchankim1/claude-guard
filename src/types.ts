export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type Category =
  | "secrets"
  | "sql"
  | "xss"
  | "auth"
  | "llm"
  | "misconfig"
  | "iac"
  | "docker"
  | "other";

// L1 = OSS orchestrator (semgrep/gitleaks if installed locally).
// L2 = native YAML-rule engine (built-in, always available).
// Redteam probe is an opt-in, per-finding *tool* — not a scan layer.
export type Layer = "l1" | "l2";

export type FixStrategy =
  | "rename_env_var"
  | "split_server_only"
  | "parameterize_query"
  | "wrap_with_authz_guard"
  | "set_cookie_flags"
  | "suggest_only";

export interface Range {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface Finding {
  id: string;
  rule_id: string;
  severity: Severity;
  category: Category;
  file: string;
  range: Range;
  message: string;
  evidence: string;
  fix_hint?: string;
  fix_strategy?: FixStrategy;
  source_engine: string;
  poc_template?: string;
}

export interface RulePattern {
  regex: string;
  files?: string[];
  // Optional exclusion patterns: if any of these match the same text
  // that `regex` matched, the finding is suppressed. Lets rules encode
  // "flag NEXT_PUBLIC_*_KEY, but not SUPABASE_ANON_KEY / *_PUBLISHABLE_KEY"
  // without relying on lookbehind (rejected by safe-regex2).
  negate?: string[];
}

export interface RuleDef {
  id: string;
  title: string;
  severity: Severity;
  category: Category;
  languages?: string[];
  patterns: RulePattern[];
  context_hint?: string;
  fix_strategy?: FixStrategy;
  poc_template?: string;
}

export interface ScanResult {
  scan_id: string;
  finding_count: number;
  duration_ms: number;
  layers_run: Layer[];
  summary_by_severity: Record<Severity, number>;
}

export interface Config {
  version: 1;
  layers: Layer[];
  engines: {
    // Per-binary switch for L1 orchestration. "auto" runs if the binary is on
    // PATH, "disabled" forces-skip regardless, "enabled" runs and surfaces a
    // warning if the binary is missing.
    semgrep: "auto" | "enabled" | "disabled";
    gitleaks: "auto" | "enabled" | "disabled";
  };
  plugins: { allowed: string[] };
  severity_threshold: Severity;
  severity_overrides: Record<string, Severity>;
  // `require_clean_tree`: refuse to apply_fixes on a dirty working tree so
  // the auto-generated rollback patch is definitely complete.
  fix: { dry_run_default: boolean; require_clean_tree: boolean };
  // `allowed_targets` was intentionally removed: the redteam probe's
  // loopback-only enforcement is hard-wired in target-guard.ts so config
  // can't relax it. Opting in via `redteam.enabled` is the only switch.
  redteam: { enabled: boolean };
}
