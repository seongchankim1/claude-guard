import type { Finding } from "../types.js";
import { renameEnvVar } from "./rename-env-var.js";
import { suggestOnly } from "./suggest-only.js";
import { setCookieFlags } from "./set-cookie-flags.js";
import { splitServerOnly } from "./split-server-only.js";
import { parameterizeQuery } from "./parameterize-query.js";
import { wrapWithAuthzGuard } from "./wrap-with-authz-guard.js";

export type { Finding };

export interface FixApplyResult {
  finding_id: string;
  status: "applied" | "suggested" | "skipped" | "failed";
  detail?: string;
  reason?: string;
  touched?: string[];
}

export async function applyFix(
  projectPath: string,
  f: Finding
): Promise<FixApplyResult> {
  switch (f.fix_strategy) {
    case "rename_env_var":
      return renameEnvVar(projectPath, f);
    case "set_cookie_flags":
      return setCookieFlags(projectPath, f);
    case "split_server_only":
      return splitServerOnly(projectPath, f);
    case "parameterize_query":
      return parameterizeQuery(projectPath, f);
    case "wrap_with_authz_guard":
      return wrapWithAuthzGuard(projectPath, f);
    case "suggest_only":
    case undefined:
    default:
      return suggestOnly(projectPath, f);
  }
}
