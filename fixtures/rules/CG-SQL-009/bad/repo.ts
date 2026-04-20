import { AppDataSource } from "./ds";
export async function get(email: string) {
  return AppDataSource.query(`SELECT * FROM users WHERE email = '${email}'`);
}
