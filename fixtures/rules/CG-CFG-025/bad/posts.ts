import { prisma } from "./db";
export async function create(req: { body: unknown }) {
  return prisma.post.create({ data: req.body });
}
