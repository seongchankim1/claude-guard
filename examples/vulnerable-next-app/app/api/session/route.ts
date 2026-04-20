// INTENTIONALLY VULNERABLE — for claude-guard demos only.
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  const { id } = await req.json();
  // Hardcoded JWT secret (CG-AUTH-001) + long expiry (CG-AUTH-009)
  const token = jwt.sign({ sub: id }, "dev-secret", { expiresIn: "30d" });
  // Missing cookie flags (CG-AUTH-002)
  cookies().set({ name: "sid", value: token });
  return Response.json({ ok: true });
}
