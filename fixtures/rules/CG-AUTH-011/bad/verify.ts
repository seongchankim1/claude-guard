import jwt from "jsonwebtoken";
export function read(token: string, secret: string) {
  return jwt.verify(token, secret, { algorithms: ["HS256", "none"] });
}
