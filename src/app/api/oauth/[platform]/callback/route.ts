import { NextResponse, type NextRequest } from "next/server";
import { consumeOAuthState, credentialsFor, getAccount, saveConnectedAccount } from "@/lib/accounts";
import { requireAuth } from "@/lib/auth";
import { config } from "@/lib/config";
import { adapter } from "@/lib/platforms";
import { isPlatform, PLATFORM_LABELS } from "@/lib/types";

const back = (params: Record<string, string>) =>
  NextResponse.redirect(new URL(`/accounts?${new URLSearchParams(params)}`, config.appUrl));

export async function GET(request: NextRequest, ctx: RouteContext<"/api/oauth/[platform]/callback">) {
  const denied = await requireAuth();
  if (denied) return NextResponse.redirect(new URL("/login", config.appUrl));
  const { platform } = await ctx.params;
  if (!isPlatform(platform)) return back({ error: "Unknown platform" });

  const q = request.nextUrl.searchParams;
  const providerError = q.get("error_description") ?? q.get("error_message") ?? q.get("error");
  if (providerError) return back({ error: `${PLATFORM_LABELS[platform]}: ${providerError}` });

  const verifier = consumeOAuthState(q.get("state") ?? "", platform);
  if (verifier === null) return back({ error: "The login link expired. Please try connecting again." });
  const code = q.get("code");
  if (!code) return back({ error: "No authorization code was returned." });

  const a = adapter(platform);
  try {
    const accounts = await a.exchangeCode(code, verifier || null);
    const warnings: string[] = [];
    for (const account of accounts) {
      const id = saveConnectedAccount(platform, account);
      if (a.afterConnect) {
        try {
          await a.afterConnect(await credentialsFor(getAccount(id)!));
        } catch (err) {
          warnings.push(
            `${account.username}: connected, but comment webhooks could not be enabled (${err instanceof Error ? err.message : err}).`,
          );
        }
      }
    }
    return back({ connected: String(accounts.length), ...(warnings.length ? { warning: warnings.join(" ") } : {}) });
  } catch (err) {
    return back({ error: `${PLATFORM_LABELS[platform]}: ${err instanceof Error ? err.message : String(err)}` });
  }
}
