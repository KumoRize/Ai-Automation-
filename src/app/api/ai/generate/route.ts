import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/auth";
import { aiConfigured, generateContent, GenerateRequest } from "@/lib/ai";

export const maxDuration = 120;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!aiConfigured())
    return Response.json({ error: "Set ANTHROPIC_API_KEY to use the AI generator." }, { status: 503 });

  const parsed = GenerateRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });

  try {
    return Response.json(await generateContent(parsed.data));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError)
      return Response.json({ error: "The Anthropic API key was rejected." }, { status: 502 });
    if (err instanceof Anthropic.RateLimitError)
      return Response.json({ error: "The AI is busy. Wait a minute and try again." }, { status: 429 });
    if (err instanceof Anthropic.APIError)
      return Response.json({ error: `AI request failed (${err.status}).` }, { status: 502 });
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
