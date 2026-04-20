export async function login(email: string, password: string, db: any) {
  const user = await db.findByEmail(email);
  if (!user || user.password !== password) return { error: "invalid credentials" };
  return { ok: true };
}
