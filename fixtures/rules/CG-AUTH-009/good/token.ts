import jwt from "jsonwebtoken";
export function make(id: string) {
  return jwt.sign({ sub: id }, process.env.JWT_SECRET!, { expiresIn: "15m" });
}
