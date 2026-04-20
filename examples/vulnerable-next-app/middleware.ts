// INTENTIONALLY VULNERABLE — for claude-guard demos only.
// Negative matcher leaves /admin un-gated (CG-AUTH-019).
export const config = {
  matcher: ["/((?!login|signup|admin|public).*)"],
};
