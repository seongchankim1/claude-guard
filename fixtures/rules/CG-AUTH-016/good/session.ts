import { cookies } from "next/headers";
export function remember(token: string) {
  cookies().set({ name: "sid", value: token, maxAge: 86400, httpOnly: true, secure: true, sameSite: "lax" });
}
