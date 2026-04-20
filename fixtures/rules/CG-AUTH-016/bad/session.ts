import { cookies } from "next/headers";
export function remember(token: string) {
  cookies().set({ name: "sid", value: token, maxAge: 31536000000, httpOnly: true, secure: true, sameSite: "lax" });
}
