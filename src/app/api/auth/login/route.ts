import { NextResponse, type NextRequest } from "next/server";
import { checkPassword, createSessionValue, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { configProblems } from "@/lib/config";

const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export async function POST(request: NextRequest) {
  const problems = configProblems();
  if (problems.length) return NextResponse.json({ error: problems.join(" ") }, { status: 500 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  for (const [key, value] of attempts) if (now - value.first >= WINDOW_MS) attempts.delete(key);
  const entry = attempts.get(ip);
  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_ATTEMPTS)
    return NextResponse.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });

  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkPassword(password)) {
    const fresh = !entry || now - entry.first >= WINDOW_MS;
    attempts.set(ip, fresh ? { count: 1, first: now } : { count: entry.count + 1, first: entry.first });
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, createSessionValue(), sessionCookieOptions);
  return res;
}
