export function saveSession(token: string) {
  // Cookie is set by the server with httpOnly + Secure + SameSite=Lax; nothing to do client-side.
  void token;
}
