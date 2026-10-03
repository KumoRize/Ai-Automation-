import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionValue, SESSION_COOKIE } from "@/lib/auth";

/**
 * Sends logged-out visitors to /login. API routes check the session themselves
 * (so large uploads aren't buffered here); webhooks and /media stay public.
 */
export function proxy(request: NextRequest) {
  if (isValidSessionValue(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!api|media|login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
