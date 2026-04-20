import jwt from "jsonwebtoken";
export function reset(email: string) {
  const resetToken = jwt.sign({ email }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  return Response.json({ ok: true, resetToken });
}
