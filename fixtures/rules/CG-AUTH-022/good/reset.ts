import jwt from "jsonwebtoken";
declare function sendEmail(to: string, body: string): Promise<void>;
export async function reset(email: string) {
  const token = jwt.sign({ email }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  await sendEmail(email, `Reset: https://app.example.com/reset?token=${token}`);
  return new Response(null, { status: 204 });
}
