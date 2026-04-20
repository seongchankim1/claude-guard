import type { Model } from "mongoose";
export async function list(UserModel: Model<{ name: string }>, req: any) {
  return UserModel.find(req.query);
}
