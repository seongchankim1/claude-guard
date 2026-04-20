import { sql } from "drizzle-orm";
import { db } from "./db";
export async function get(where: string) {
  return db.execute(sql.raw(where));
}
