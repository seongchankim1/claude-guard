import { prisma } from "./db";
export async function signup(req: { body: { email: string } }) {
  return prisma.user.create({ data: { email: req.body.email, role: "member" } });
}
