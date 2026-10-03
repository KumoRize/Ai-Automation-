import { NextResponse, type NextRequest } from "next/server";
import { createDemoAccount, saveOAuthState } from "@/lib/accounts";
import { requireAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { pkcePair, randomId } from "@/lib/crypto";
import { adapter } from "@/lib/platforms";
import { isPlatform } from "@/lib/types";

const back = (query: string) => NextResponse.redirect(new URL(`/accounts?${query}`, config.appUrl));

/** Starts the OAuth flow for a platform, or adds a demo account with ?demo=1. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/connect/[platform]">) {
  const denied = await requireAuth();
  if (denied) return NextResponse.redirect(new URL("/login", config.appUrl));
  const { platform } = await ctx.params;
  if (!isPlatform(platform)) return back("error=Unknown+platform");

  if (request.nextUrl.searchParams.get("demo") === "1") {
    createDemoAccount(platform);
    return back("connected=demo");
  }

  const a = adapter(platform);
  if (!a.isConfigured()) return back(`error=${encodeURIComponent(`Set ${a.requiredEnv.join(", ")} first.`)}`);

  const state = randomId(24);
  const pkce = a.usesPkce ? pkcePair() : null;
  saveOAuthState(state, platform, pkce?.verifier ?? null);
  return NextResponse.redirect(a.authUrl(state, pkce?.challenge ?? null));
}
