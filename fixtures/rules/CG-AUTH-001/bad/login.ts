import jwt from "jsonwebtoken";
export function make(id: string) {
  return jwt.sign({ sub: id }, "dev-secret");
}
