"use server";
import { prisma } from "./db";
export async function createPost(title: string, body: string) {
  return prisma.post.create({ data: { title, body } });
}
