import { sql } from "drizzle-orm";
import { db } from "./db";
export async function get(email: string) {
  return db.execute(sql`SELECT * FROM users WHERE email = ${email}`);
}
