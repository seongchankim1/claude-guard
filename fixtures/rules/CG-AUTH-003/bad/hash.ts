import bcrypt from "bcrypt";
export async function weak(pw: string) {
  return bcrypt.hash(pw, 8);
}
