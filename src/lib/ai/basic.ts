import { normalizeHashtags } from "../captions";
import type { GeneratedContent, GenerateRequest } from "./schema";

// Works with no API key and no internet: builds hashtags and keywords from the words in the topic,
// and writes the caption from a template for the chosen style. Simple, but always available.

const STOPWORDS = new Set(
  `a an and are as at be but by for from has have how i in into is it its my of on or our so that the their this
  to was we what when where which who why will with you your about after all also any can do get just more most new
  not now one only out over some than then there these they very want way best make our us me`.split(/\s+/),
);

const PLATFORM_TAGS: Record<string, string[]> = {
  instagram: ["#reels", "#instagood", "#explorepage"],
  tiktok: ["#fyp", "#foryou", "#tiktok"],
  youtube: ["#shorts", "#youtubeshorts"],
  facebook: ["#facebookreels"],
  x: [],
};

const TEMPLATES: Record<string, { hook: string; caption: string }> = {
  witty: {
    hook: "Plot twist: {Topic} is about to get interesting 👀",
    caption: "Nobody asked, but here's everything you need to know about {topic}. Save this before your group chat finds it.",
  },
  luxury: {
    hook: "{Topic}, elevated.",
    caption: "Some things deserve more than ordinary. A closer look at {topic}, crafted for those who notice the details.",
  },
  "gen z": {
    hook: "ok but {topic} is lowkey everything 😭",
    caption: "not me getting obsessed with {topic}… if you know you know. tell me I'm not the only one 👇",
  },
  professional: {
    hook: "What you should know about {topic}",
    caption: "A quick, practical breakdown of {topic}: what matters, what to skip, and where to start today.",
  },
  storytelling: {
    hook: "I didn't expect {topic} to change my week.",
    caption: "It started small. Then {topic} turned into the thing everyone kept asking me about. Here's how it went.",
  },
  minimal: { hook: "{Topic}.", caption: "{Topic}. That's it. That's the post." },
  motivational: {
    hook: "Your sign to start {topic} today ✨",
    caption: "Small steps add up. {Topic} is proof that showing up every day beats waiting for the perfect moment.",
  },
  default: {
    hook: "Everything you need to know about {topic} 👇",
    caption: "Here's my take on {topic}. Save this for later and share it with someone who needs it.",
  },
};

function words(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function shortTopic(topic: string): string {
  const first = topic.split(/[.\n!?]/)[0].trim();
  return [...first].length > 80 ? `${[...first].slice(0, 77).join("").trimEnd()}…` : first;
}

export function generateBasic(req: GenerateRequest): GeneratedContent {
  const w = words(req.topic);
  const unique = [...new Set(w)];
  const pairs = w.slice(0, -1).map((x, i) => `${x} ${w[i + 1]}`).filter((p, i, all) => all.indexOf(p) === i);

  const keywords = [...pairs.slice(0, 6), ...unique.slice(0, 6), ...unique.slice(0, 2).map((x) => `${x} tips`)];
  const platformTags = (req.platforms.length ? req.platforms : Object.keys(PLATFORM_TAGS)).flatMap(
    (p) => PLATFORM_TAGS[p.toLowerCase()] ?? [],
  );
  const hashtags = normalizeHashtags([
    ...unique.slice(0, 8),
    ...pairs.slice(0, 5).map((p) => p.replace(" ", "")),
    ...platformTags,
  ]).slice(0, 20);

  const raw = shortTopic(req.topic);
  // Lowercase the first letter for use mid-sentence, unless it starts an acronym like "AI" or "NYC".
  const topic = /^\p{Lu}\p{Ll}/u.test(raw) ? raw.charAt(0).toLowerCase() + raw.slice(1) : raw;
  const Topic = raw.charAt(0).toUpperCase() + raw.slice(1);
  const key = req.style.trim().toLowerCase();
  const t = TEMPLATES[key] ?? TEMPLATES.default;
  const fill = (s: string) => s.replaceAll("{topic}", topic).replaceAll("{Topic}", Topic);

  return {
    hook: fill(t.hook),
    caption: fill(t.caption),
    title: [...Topic].slice(0, 90).join(""),
    hashtags,
    keywords: [...new Set(keywords)].slice(0, 12),
    styleNotes:
      "Written by Basic mode, which uses templates and the words in your topic. Add a free Gemini or Groq key on the Setup page for real AI captions and live trending hashtags.",
    sources: [],
    provider: "Basic mode (no AI key)",
    liveChecked: false,
  };
}
