import { z } from "zod";
import { normalizeHashtags } from "../captions";

export const GenerateRequest = z.object({
  topic: z.string().trim().min(2, "Describe your post in a few words.").max(2000),
  style: z.string().trim().max(200).default(""),
  platforms: z.array(z.string()).default([]),
  language: z.string().trim().max(50).default("English"),
  liveTrends: z.boolean().default(false),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

/** What every provider must return. Lenient on purpose: models sometimes send a string where a list is expected. */
const list = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => (Array.isArray(v) ? v : v.split(/[,\n]+/)));

export const ModelOutput = z.object({
  caption: z.string().min(1),
  hook: z.string().default(""),
  title: z.string().default(""),
  hashtags: list,
  keywords: list,
  styleNotes: z.string().default(""),
});

export interface GeneratedContent {
  caption: string;
  hook: string;
  title: string;
  hashtags: string[];
  keywords: string[];
  styleNotes: string;
  sources: { title: string; url: string }[];
  /** Which engine wrote this, shown under the results. */
  provider: string;
  /** True when current web trends were actually checked. */
  liveChecked: boolean;
  /** Set when the AI service failed and Basic mode filled in. */
  notice?: string;
}

/** Pulls a JSON object out of a model reply, tolerating ```json fences or text around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The AI reply had no JSON in it.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function finalize(
  raw: unknown,
  extra: { sources?: GeneratedContent["sources"]; provider: string; liveChecked: boolean },
): GeneratedContent {
  const parsed = ModelOutput.safeParse(raw);
  if (!parsed.success) throw new Error("The AI reply was incomplete. Please try again.");
  const out = parsed.data;
  return {
    caption: out.caption.trim(),
    hook: out.hook.trim(),
    title: [...out.title.trim()].slice(0, 100).join(""),
    hashtags: normalizeHashtags(out.hashtags).slice(0, 30),
    keywords: [...new Set(out.keywords.map((k) => k.trim().replace(/^#/, "")).filter(Boolean))].slice(0, 20),
    styleNotes: out.styleNotes.trim(),
    sources: extra.sources ?? [],
    provider: extra.provider,
    liveChecked: extra.liveChecked,
  };
}
