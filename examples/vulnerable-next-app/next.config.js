// INTENTIONALLY VULNERABLE — for claude-guard demos only.
module.exports = {
  env: {
    // Exposes the server-side secret to the client bundle (CG-SEC-013)
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
};
