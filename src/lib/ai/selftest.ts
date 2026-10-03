import { aiStatus, generateContent } from ".";

/**
 * Optional startup check (set AI_SELF_TEST=1): makes one real AI request, including the live
 * trend search, and writes the outcome to the server log. Useful for confirming a new key works
 * from the host's logs. Never logs the key itself.
 */
export async function runAiSelfTest(): Promise<void> {
  const status = aiStatus();
  console.log(`[ai-selftest] configured: ${status.label}${status.problem ? ` (problem: ${status.problem})` : ""}`);
  const started = Date.now();
  try {
    const out = await generateContent({
      topic: "Homemade chicken biryani recipe for Eid",
      style: "Storytelling",
      platforms: ["instagram", "tiktok", "youtube"],
      language: "English",
      liveTrends: true,
    });
    const ok = !out.provider.startsWith("Basic") || status.chain.length === 0;
    console.log(
      `[ai-selftest] ${ok ? "PASS" : "FAIL"} in ${Date.now() - started}ms — engine: ${out.provider}; ` +
        `live trends checked: ${out.liveChecked}; sources: ${out.sources.length}; ` +
        `hashtags: ${out.hashtags.length}; keywords: ${out.keywords.length}`,
    );
    console.log(`[ai-selftest] hook: ${out.hook}`);
    console.log(`[ai-selftest] hashtags: ${out.hashtags.slice(0, 10).join(" ")}`);
    if (out.notice) console.log(`[ai-selftest] note: ${out.notice}`);
  } catch (err) {
    console.log(`[ai-selftest] FAIL — ${err instanceof Error ? err.message : String(err)}`);
  }
}
