// INTENTIONALLY VULNERABLE — for claude-guard demos only.
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const body = await req.json();
  // RegExp from user input (CG-CFG-030)
  const re = new RegExp(body.pattern);
  // SQL string concat (CG-SQL-001)
  const rows = await prisma.$queryRawUnsafe(
    "SELECT * FROM posts WHERE title LIKE '%" + body.q + "%'"
  );
  return Response.json({ rows, match: re.source });
}
