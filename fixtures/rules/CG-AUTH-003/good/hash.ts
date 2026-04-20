import bcrypt from "bcrypt";
export async function strong(pw: string) {
  return bcrypt.hash(pw, 12);
}
