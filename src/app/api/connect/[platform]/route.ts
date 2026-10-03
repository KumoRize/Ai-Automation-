import { NextResponse, type NextRequest } from "next/server";
import { createDemoAccount, saveOAuthState } from "@/lib/accounts";
import { requireAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { pkcePair, randomId } from "@/lib/crypto";
import { adapter } from "@/lib/platforms";
import { isPlatform } from "@/lib/types";

const back = (query: string) => NextResponse.redirect(new URL(`/accounts?${query}`, config.appUrl));

/** Adds a demo account. A POST (from a form) so other sites can't trigger it with a link. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/connect/[platform]">) {
  const denied = await requireAuth();
  if (denied) return NextResponse.redirect(new URL("/login", config.appUrl), 303);
  const { platform } = await ctx.params;
  if (!isPlatform(platform)) return NextResponse.redirect(new URL("/accounts?error=Unknown+platform", config.appUrl), 303);
  createDemoAccount(platform);
  return NextResponse.redirect(new URL("/accounts?connected=demo", config.appUrl), 303);
}

/** Starts the OAuth login for a platform. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/connect/[platform]">) {
  const denied = await requireAuth();
  if (denied) return NextResponse.redirect(new URL("/login", config.appUrl));
  const { platform } = await ctx.params;
  if (!isPlatform(platform)) return back("error=Unknown+platform");

  const a = adapter(platform);
  if (!a.isConfigured()) return back(`error=${encodeURIComponent(`Set ${a.requiredEnv.join(", ")} first.`)}`);

  const state = randomId(24);
  const pkce = a.usesPkce ? pkcePair() : null;
  saveOAuthState(state, platform, pkce?.verifier ?? null);
  return NextResponse.redirect(a.authUrl(state, pkce?.challenge ?? null));
}
