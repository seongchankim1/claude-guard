import { prisma } from "./db";
import { z } from "zod";
const PostInput = z.object({ title: z.string().min(1), body: z.string() });
export async function create(req: { body: unknown }) {
  const data = PostInput.parse(req.body);
  return prisma.post.create({ data });
}
