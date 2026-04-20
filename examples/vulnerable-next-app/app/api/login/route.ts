// INTENTIONALLY VULNERABLE — for claude-guard demos only.
import jwt from "jsonwebtoken";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  const token = jwt.sign({ sub: body.id }, "dev-secret");
  return Response.json({ token });
}
