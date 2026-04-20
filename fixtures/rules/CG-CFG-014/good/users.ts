import type { Model } from "mongoose";
export async function list(UserModel: Model<{ name: string }>, req: { query: { name?: unknown } }) {
  const name = typeof req.query.name === "string" ? req.query.name : "";
  return UserModel.find({ name });
}
