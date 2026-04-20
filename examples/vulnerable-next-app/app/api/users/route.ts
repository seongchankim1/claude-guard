// INTENTIONALLY VULNERABLE — for claude-guard demos only.
// Do not reuse this code.
import { prisma } from "@/lib/prisma";

export async function GET(req: Request): Promise<Response> {
  const id = new URL(req.url).searchParams.get("id");
  const users = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE id = ${id}`
  );
  return Response.json({ users });
}
