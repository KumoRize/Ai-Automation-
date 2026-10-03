import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { researchPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt";
import { finalize, type GeneratedContent, type GenerateRequest } from "./schema";

// Anthropic Claude: paid per use (https://console.anthropic.com). Best writing quality, and it can
// check live trends with Anthropic's web search tool.

const ClaudeOutput = z.object({
  hook: z.string().describe("Scroll-stopping first line, under 12 words."),
  caption: z.string().describe("Ready-to-post caption in the requested style, without hashtags."),
  title: z.string().describe("Short title for YouTube/TikTok, under 90 characters."),
  hashtags: z
    .array(z.string())
    .describe("15-25 hashtags, each starting with #, best first (Instagram only keeps the first 5)."),
  keywords: z.array(z.string()).describe("8-15 search keywords or phrases people type."),
  styleNotes: z.string().describe("One or two sentences describing the voice used."),
});

async function research(client: Anthropic, model: string, req: GenerateRequest) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: researchPrompt(req) }];
  let response: Anthropic.Beta.BetaMessage | undefined;
  // A long search can pause; send the paused turn back so the server continues (at most 3 times).
  for (let i = 0; i < 3; i++) {
    response = await client.beta.messages.create({
      model,
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

export async function generateWithClaude(
  apiKey: string,
  model: string,
  req: GenerateRequest,
): Promise<GeneratedContent> {
  const client = new Anthropic({ apiKey });
  let trends = { notes: "", sources: [] as { url: string; title: string }[] };
  if (req.liveTrends) {
    try {
      trends = await research(client, model, req);
    } catch (err) {
      console.warn("[ai] Claude trend search failed, continuing without it:", err);
    }
  }

  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: betaZodOutputFormat(ClaudeOutput) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt(req, trends.notes) }],
  });
  if (response.stop_reason === "refusal")
    throw new Error("Claude declined this request. Try describing the post differently.");
  if (!response.parsed_output) throw new Error("Claude's reply was incomplete. Please try again.");

  return finalize(response.parsed_output, {
    sources: trends.sources,
    provider: `Anthropic Claude (${response.model})`,
    liveChecked: Boolean(trends.notes),
  });
}
