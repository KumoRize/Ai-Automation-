export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

/** Pulls a readable message out of the different error shapes each platform returns. */
function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const b = body as Record<string, unknown>;
  const err = b.error as Record<string, unknown> | string | undefined;
  if (typeof err === "string") return (b.error_description as string) ?? err;
  if (err && typeof err === "object") {
    const msg = (err.error_user_msg ?? err.message ?? err.code) as string | undefined;
    if (msg && msg !== "ok") return String(msg);
  }
  if (Array.isArray(b.errors) && b.errors[0]) {
    const first = b.errors[0] as Record<string, unknown>;
    return String(first.message ?? first.detail ?? fallback);
  }
  if (typeof b.detail === "string") return b.detail;
  if (typeof b.title === "string") return b.title;
  return fallback;
}

export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { json?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json; charset=UTF-8");
    body = JSON.stringify(init.json);
  } else if (init.form) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams(init.form).toString();
  }
  const res = await fetch(url, { ...init, headers, body });
  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = undefined;
  }
  if (!res.ok) {
    throw new PlatformError(errorMessage(parsed, `HTTP ${res.status}: ${text.slice(0, 300)}`), res.status);
  }
  // TikTok returns HTTP 200 with error.code != "ok" on some failures.
  const tiktokError = (parsed as { error?: { code?: string; message?: string } } | undefined)?.error;
  if (tiktokError && typeof tiktokError === "object" && tiktokError.code && tiktokError.code !== "ok") {
    throw new PlatformError(tiktokError.message || tiktokError.code, res.status);
  }
  return (parsed ?? {}) as T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
