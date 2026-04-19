import type { Finding } from "../types.js";

export function renderStaticPoc(f: Finding): string {
  if (!f.poc_template) return "(no PoC template for this rule)";
  const envName = extractEnvName(f.evidence);
  return f.poc_template
    .replaceAll("<APP_URL>", "http://localhost:3000")
    .replaceAll("<ENV_NAME>", envName ?? f.evidence.slice(0, 60))
    .replaceAll("<LITERAL>", f.evidence.slice(0, 60));
}

function extractEnvName(evidence: string): string | null {
  const m = evidence.match(/(NEXT_PUBLIC_[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,})/);
  return m ? m[1] : null;
}
