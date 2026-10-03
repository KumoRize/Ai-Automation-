import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { normalizeHashtags } from "./captions";
import { config } from "./config";

export const GenerateRequest = z.object({
  topic: z.string().trim().min(2, "Describe your post in a few words.").max(2000),
  style: z.string().trim().max(200).default(""),
  platforms: z.array(z.string()).default([]),
  language: z.string().trim().max(50).default("English"),
  liveTrends: z.boolean().default(false),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

const GeneratedContent = z.object({
  caption: z.string().describe("Ready-to-post caption in the requested style, without hashtags."),
  hook: z.string().describe("A scroll-stopping first line or on-screen text, under 12 words."),
  title: z.string().describe("Short title for YouTube/TikTok, under 90 characters."),
  hashtags: z.array(z.string()).describe("15-25 hashtags mixing broad, niche and trending, each starting with #."),
  keywords: z.array(z.string()).describe("8-15 search keywords and phrases people type to find this content."),
  styleNotes: z.string().describe("One or two sentences on the voice used, so the user can keep it consistent."),
});
export type GeneratedContent = z.infer<typeof GeneratedContent> & { sources: { title: string; url: string }[] };

const SYSTEM = `You are a social media strategist who writes for Instagram, Facebook, TikTok, YouTube and X.
Write captions that sound like a real creator, not a brand template: concrete, specific, no filler or clichés.
Hashtags must be real tags people use. Mix a few broad high-volume tags with niche ones that match the topic.
Keywords are the phrases people actually type into search on these platforms.
If you were given research notes about current trends, prefer what they show over your general knowledge.
Without research notes, pick tags that are reliably popular in this niche and say in styleNotes that they are not live-checked.`;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Uses Claude's web search tool to see what's trending right now for the topic. */
async function researchTrends(client: Anthropic, req: GenerateRequest) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `Research what is trending right now for this topic on ${req.platforms.join(", ") || "Instagram, TikTok, YouTube and X"}:

"${req.topic}"

Find current trending hashtags, search keywords, sounds or formats, and angles creators are using this month. Reply with concise bullet notes.`,
    },
  ];
  let response: Anthropic.Beta.BetaMessage | undefined;
  // A long search can pause; resend the paused turn to let the server continue (max 3 times).
  for (let i = 0; i < 3; i++) {
    response = await client.beta.messages.create({
      model: config.anthropicModel,
      max_tokens: 16000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
      messages,
    });
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }
  if (!response || response.stop_reason === "refusal") return { notes: "", sources: [] };

  const sources = new Map<string, string>();
  let notes = "";
  for (const block of response.content) {
    if (block.type === "text") notes += block.text;
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) sources.set(result.url, result.title);
    }
  }
  return { notes, sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })) };
}

export async function generateContent(req: GenerateRequest): Promise<GeneratedContent> {
  const client = new Anthropic();
  const research = req.liveTrends ? await researchTrends(client, req) : { notes: "", sources: [] };

  const prompt = [
    `Post idea: ${req.topic}`,
    `Style / voice: ${req.style || "natural, confident, friendly"}`,
    `Platforms: ${req.platforms.join(", ") || "Instagram, Facebook, TikTok, YouTube, X"}`,
    `Language: ${req.language}`,
    research.notes ? `Research notes on current trends:\n${research.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await client.beta.messages.parse({
    model: config.anthropicModel,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(GeneratedContent) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal")
    throw new Error("The AI declined this request. Try describing the post differently.");
  const out = response.parsed_output;
  if (!out) throw new Error("The AI response was incomplete. Please try again.");

  return {
    ...out,
    hashtags: normalizeHashtags(out.hashtags),
    keywords: [...new Set(out.keywords.map((k) => k.trim()).filter(Boolean))],
    sources: research.sources,
  };
}
