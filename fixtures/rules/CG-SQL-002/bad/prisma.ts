import { prisma } from "./db";
export async function bad(x: string) {
  return prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${x}'`);
}
