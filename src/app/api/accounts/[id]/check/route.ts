import { credentialsFor, getAccount } from "@/lib/accounts";
import { requireAuth } from "@/lib/auth";
import { adapter } from "@/lib/platforms";
import { PLATFORM_LABELS } from "@/lib/types";

/** "Test" button on the Accounts page: proves the saved login still works (and renews it if needed). */
export async function POST(_request: Request, ctx: RouteContext<"/api/accounts/[id]/check">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  const account = getAccount(id);
  if (!account) return Response.json({ ok: false, message: "Account not found." }, { status: 404 });
  if (account.demo) return Response.json({ ok: true, message: "Demo account: nothing to check, posting is simulated." });
  try {
    const name = await adapter(account.platform).verify(await credentialsFor(account));
    return Response.json({ ok: true, message: `Connected to ${PLATFORM_LABELS[account.platform]} as ${name}.` });
  } catch (err) {
    return Response.json({
      ok: false,
      message: `${PLATFORM_LABELS[account.platform]} says: ${err instanceof Error ? err.message : String(err)}. Try reconnecting the account.`,
    });
  }
}
