export function makeResetToken() {
  const token = Math.random().toString(36).slice(2);
  return token;
}
