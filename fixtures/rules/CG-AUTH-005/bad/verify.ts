import jwt from "jsonwebtoken";
export function read(token: string) {
  return jwt.decode(token);
}
