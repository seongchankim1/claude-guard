async function run(db: any, email: string) {
  return db.query("SELECT * FROM users WHERE email = '" + email + "'");
}
export { run };
