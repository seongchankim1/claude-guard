import { cookies } from "next/headers";
export function login() {
  cookies().set({ name: "sid", value: "abc" });
}
