import { cookies } from "next/headers";
const IS_PROD = process.env.NODE_ENV === "production";
export function setSid(v: string) {
  cookies().set({ name: "sid", value: v, httpOnly: true, secure: IS_PROD, sameSite: "lax" });
}
