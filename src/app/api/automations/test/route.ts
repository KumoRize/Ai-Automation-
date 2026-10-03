import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { planReply } from "@/lib/automation";
import { getPost } from "@/lib/publisher";
import { PLATFORMS } from "@/lib/types";

const Body = z.object({
  platform: z.enum(PLATFORMS),
  text: z.string().min(1).max(2000),
  postId: z.string().nullable().default(null),
  authorName: z.string().max(100).default("Alex"),
});

/** Dry run: shows which rule a comment would trigger and what would be sent. Nothing is posted. */
export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a platform and a comment." }, { status: 400 });
  const { platform, text, postId, authorName } = parsed.data;
  const post = postId ? getPost(postId) ?? null : null;
  const plan = planReply({ platform, text, authorName }, post);
  return Response.json({
    matched: plan.automation ? { id: plan.automation.id, name: plan.automation.name } : null,
    publicReply: plan.publicReply,
    dm: plan.dm,
  });
}
