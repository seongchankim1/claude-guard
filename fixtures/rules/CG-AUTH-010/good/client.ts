export async function login(user: string, password: string) {
  return fetch("https://api.example.com/login", {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${user}:${password}`)}` },
  });
}
