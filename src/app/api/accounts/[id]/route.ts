import { deleteAccount } from "@/lib/accounts";
import { requireAuth } from "@/lib/auth";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  deleteAccount(id);
  return Response.json({ ok: true });
}
