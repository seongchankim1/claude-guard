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

export type Layer = "l1" | "l2" | "l3";

export type FixStrategy =
  | "rename_env_var"
  | "split_server_only"
  | "parameterize_query"
  | "add_rls_migration"
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
    semgrep: "auto" | "enabled" | "disabled";
    trivy: "auto" | "enabled" | "disabled";
    gitleaks: "auto" | "enabled" | "disabled";
  };
  plugins: { allowed: string[] };
  severity_threshold: Severity;
  fix: { dry_run_default: boolean; require_clean_tree: boolean };
  redteam: { enabled: boolean; allowed_targets: string[] };
}
