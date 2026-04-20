import { prisma } from "./db";
export async function safe(x: string) {
  return prisma.$queryRaw`SELECT * FROM users WHERE email = ${x}`;
}
