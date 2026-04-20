import { cookies } from "next/headers";
export function setSid(v: string) {
  cookies().set({ name: "sid", value: v, httpOnly: true, secure: true, sameSite: "lax" });
}
