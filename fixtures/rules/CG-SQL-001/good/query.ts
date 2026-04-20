async function run(db: any, email: string) {
  return db.query("SELECT * FROM users WHERE email = $1", [email]);
}
export { run };
