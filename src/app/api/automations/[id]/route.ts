import { requireAuth } from "@/lib/auth";
import { deleteAutomation, setAutomationActive } from "@/lib/automation";

export async function PATCH(request: Request, ctx: RouteContext<"/api/automations/[id]">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { active } = (await request.json().catch(() => ({}))) as { active?: boolean };
  if (typeof active !== "boolean") return Response.json({ error: "active must be true or false" }, { status: 400 });
  setAutomationActive(id, active);
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/automations/[id]">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  deleteAutomation(id);
  return Response.json({ ok: true });
}
