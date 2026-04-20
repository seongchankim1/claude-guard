export async function login(user: string, password: string) {
  return fetch(`https://api.example.com/login?user=${user}&password=${password}`);
}
