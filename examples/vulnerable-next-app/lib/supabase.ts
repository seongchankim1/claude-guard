// INTENTIONALLY VULNERABLE — for claude-guard demos only.
// service_role must never exist in a file that can be imported by the client.
import { createClient } from "@supabase/supabase-js";

export const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
);
