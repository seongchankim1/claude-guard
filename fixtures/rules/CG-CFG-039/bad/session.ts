import { cookies } from "next/headers";
export function setSid(v: string) {
  cookies().set({ name: "sid", value: v, domain: ".example.com", httpOnly: true, secure: true, sameSite: "lax" });
}
