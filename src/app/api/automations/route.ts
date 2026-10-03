import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { createAutomation, validateAutomation } from "@/lib/automation";
import { parseKeywords } from "@/lib/keywords";
import { PLATFORMS } from "@/lib/types";

const AutomationBody = z.object({
  name: z.string().max(100).default(""),
  postId: z.string().nullable().default(null),
  platforms: z.array(z.enum(PLATFORMS)),
  keywords: z.union([z.string(), z.array(z.string())]).default(""),
  matchMode: z.enum(["contains", "exact", "any"]).default("contains"),
  publicReply: z.string().max(2000).default(""),
  dmMessage: z.string().max(1000).default(""),
  includeLink: z.boolean().default(true),
});

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const parsed = AutomationBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid automation." }, { status: 400 });
  const input = { ...parsed.data, keywords: parseKeywords(parsed.data.keywords) };
  const problem = validateAutomation(input);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  return Response.json({ id: createAutomation(input) });
}
