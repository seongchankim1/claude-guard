export async function find(db: any, x: string) {
  return db.collection("u").find({ $where: "this.name == '" + x + "'" });
}
