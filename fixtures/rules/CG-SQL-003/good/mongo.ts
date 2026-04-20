export async function find(db: any, name: string) {
  return db.collection("u").find({ name });
}
