import { requireAuth } from "@/lib/auth";
import { deletePost } from "@/lib/publisher";

/** Removes the post from this app. Posts that are already live on a platform stay there. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/posts/[id]">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  deletePost(id);
  return Response.json({ ok: true });
}
