export function saveSession(token: string) {
  localStorage.setItem("jwt", token);
}
