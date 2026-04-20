export async function login(email: string, password: string, db: any) {
  const user = await db.findByEmail(email);
  if (!user) return { error: "user not found" };
  if (user.password !== password) return { error: "wrong password" };
  return { ok: true };
}
