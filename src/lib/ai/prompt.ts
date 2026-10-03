import type { GenerateRequest } from "./schema";

export const SYSTEM_PROMPT = `You are a social media strategist who writes for Instagram, Facebook, TikTok, YouTube and X.
Write captions that sound like a real creator, not a brand template: concrete, specific, no filler or clichés.
Hashtags must be real tags people use. Mix a few broad high-volume tags with niche ones that match the topic.
Keywords are the phrases people actually type into search on these platforms.
If you were given research notes about current trends, prefer them over your general knowledge.
Without research notes, pick tags that are reliably popular in this niche and say in styleNotes that they were not checked live.`;

export const JSON_SHAPE = `Reply with only a JSON object with exactly these keys:
{
  "hook": "scroll-stopping first line, under 12 words",
  "caption": "ready-to-post caption in the requested style, without hashtags",
  "title": "short title for YouTube/TikTok, under 90 characters",
  "hashtags": ["15-25 hashtags, each starting with #, best first (Instagram only keeps the first 5)"],
  "keywords": ["8-15 search keywords or phrases"],
  "styleNotes": "one or two sentences describing the voice used"
}`;

export function userPrompt(req: GenerateRequest, researchNotes: string): string {
  return [
    `Post idea: ${req.topic}`,
    `Style / voice: ${req.style || "natural, confident, friendly"}`,
    `Platforms: ${req.platforms.join(", ") || "Instagram, Facebook, TikTok, YouTube, X"}`,
    `Write everything in: ${req.language || "English"}`,
    researchNotes ? `Research notes on current trends:\n${researchNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function researchPrompt(req: GenerateRequest): string {
  return `Search the web for what is trending right now for this topic on ${
    req.platforms.join(", ") || "Instagram, TikTok, YouTube and X"
  }:

"${req.topic}"

List current trending hashtags, search keywords, formats and angles creators are using this month. Reply with short bullet notes.`;
}
