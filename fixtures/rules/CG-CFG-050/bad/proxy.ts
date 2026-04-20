export async function proxy() {
  const res = await fetch("https://api.example.com/data");
  return res.json();
}
