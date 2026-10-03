import { cookies } from "next/headers";
import { config } from "./config";
import { hmac, safeEqual } from "./crypto";

export const SESSION_COOKIE = "sa_session";
const SESSION_DAYS = 30;

export function createSessionValue(now = Date.now()): string {
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${hmac(`session:${expires}`)}`;
}

export function isValidSessionValue(value: string | undefined, now = Date.now()): boolean {
  if (!value || !config.appSecret) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig || Number(expires) < now) return false;
  return safeEqual(sig, hmac(`session:${expires}`));
}

export function checkPassword(candidate: string): boolean {
  if (!config.appPassword) return false;
  return safeEqual(hmac(candidate, "pw"), hmac(config.appPassword, "pw"));
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: config.appUrl.startsWith("https://"),
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

/** For route handlers: returns a 401 response when the caller isn't logged in. */
export async function requireAuth(): Promise<Response | null> {
  const store = await cookies();
  if (isValidSessionValue(store.get(SESSION_COOKIE)?.value)) return null;
  return Response.json({ error: "Not logged in" }, { status: 401 });
}
