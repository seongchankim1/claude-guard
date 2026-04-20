import knex from "knex";
const db = knex({});
export async function bad(email: string) {
  return db.raw(`SELECT * FROM users WHERE email = '${email}'`);
}
