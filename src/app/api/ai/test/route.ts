import { requireAuth } from "@/lib/auth";
import { aiStatus, generateContent } from "@/lib/ai";

export const maxDuration = 120;

/** "Test AI" button on the Setup page: runs one small generation and reports which engine answered. */
export async function POST() {
  const denied = await requireAuth();
  if (denied) return denied;
  const status = aiStatus();
  const out = await generateContent({
    topic: "Quick test: a sunny morning coffee photo",
    style: "Friendly",
    platforms: ["instagram"],
    language: "English",
    liveTrends: false,
  });
  if (!status.chain.length)
    return Response.json({ ok: true, message: "Basic mode works. Add a free Gemini key for real AI." });
  if (out.notice && out.provider.startsWith("Basic"))
    return Response.json({ ok: false, message: out.notice });
  return Response.json({
    ok: true,
    message: `Working: ${out.provider} answered with “${out.hook}”.${out.notice ? ` Note: ${out.notice}` : ""}`,
  });
}
