import { sequelize } from "./db";
export async function get(email: string) {
  return sequelize.query(`SELECT * FROM users WHERE email = '${email}'`);
}
