import { config } from "@/lib/config";
import { safeEqual } from "@/lib/crypto";
import { tick } from "@/lib/scheduler";

export const maxDuration = 300;

/**
 * For hosts where the built-in 1-minute scheduler can't run (serverless):
 * call this every minute with "Authorization: Bearer <CRON_SECRET>".
 */
async function handle(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!config.cronSecret || !safeEqual(auth, `Bearer ${config.cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await tick({ wait: true }));
}

export const GET = handle;
export const POST = handle;
