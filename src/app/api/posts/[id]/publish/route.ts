import { after } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getPost, publishPost } from "@/lib/publisher";

/** Publishes now: retries failed platforms, or sends a scheduled post early. */
export async function POST(_request: Request, ctx: RouteContext<"/api/posts/[id]/publish">) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!getPost(id)) return Response.json({ error: "Post not found" }, { status: 404 });
  after(() => publishPost(id));
  return Response.json({ ok: true });
}
