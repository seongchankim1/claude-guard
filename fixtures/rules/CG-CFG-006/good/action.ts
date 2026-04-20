"use server";
import { prisma } from "./db";
import { auth } from "./auth";
export async function createPost(title: string, body: string) {
  const session = await auth();
  if (!session?.user) throw new Error("unauth");
  return prisma.post.create({ data: { title, body, userId: session.user.id } });
}
