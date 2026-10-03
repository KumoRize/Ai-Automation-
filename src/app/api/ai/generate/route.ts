import { requireAuth } from "@/lib/auth";
import { describeAiError, generateContent, GenerateRequest } from "@/lib/ai";

export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const parsed = GenerateRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  try {
    return Response.json(await generateContent(parsed.data));
  } catch (err) {
    console.error("[ai] generation failed:", err);
    return Response.json({ error: describeAiError(err) }, { status: 500 });
  }
}
