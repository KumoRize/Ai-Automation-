import type { Platform } from "./types";

export interface CaptionInput {
  title: string;
  caption: string;
  link: string | null;
  linkInCaption: boolean;
}

// \p{M} keeps combining marks (Urdu, Hindi, Arabic, Thai vowels) inside the tag.
const HASHTAG_RE = /#[\p{L}\p{M}\p{N}_]+/gu;
const URL_RE = /https?:\/\/\S+/g;

export function extractHashtags(text: string): string[] {
  return [...new Set(text.match(HASHTAG_RE) ?? [])];
}

/** Turns "fitness, #gym  workout" into ["#fitness", "#gym", "#workout"]. */
export function normalizeHashtags(input: string[] | string): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[\s,]+/);
  const tags = parts
    .map((p) => p.trim().replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, ""))
    .filter(Boolean)
    .map((p) => `#${p}`);
  return [...new Set(tags)];
}

/**
 * X counts most Latin text as 1 per character, other scripts and emoji as 2,
 * and every URL as 23 regardless of length (twitter-text weighting).
 */
export function xWeightedLength(text: string): number {
  let length = 0;
  const withoutUrls = text.replace(URL_RE, () => {
    length += 23;
    return "";
  });
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0)!;
    const light =
      cp <= 0x10ff ||
      (cp >= 0x2000 && cp <= 0x200d) ||
      (cp >= 0x2010 && cp <= 0x201f) ||
      (cp >= 0x2032 && cp <= 0x2037);
    length += light ? 1 : 2;
  }
  return length;
}

function truncateX(text: string, budget: number): string {
  if (xWeightedLength(text) <= budget) return text;
  let out = "";
  for (const ch of text) {
    if (xWeightedLength(out + ch + "…") > budget) break;
    out += ch;
  }
  return out.trimEnd() + "…";
}

function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join("").trimEnd() + "…";
}

/** Instagram rejects posts with more than 5 hashtags (limit since December 2025). */
export const INSTAGRAM_MAX_HASHTAGS = 5;

/** Keeps the first `max` hashtags and removes the rest. */
function capHashtags(text: string, max: number): string {
  let count = 0;
  return text
    .replace(HASHTAG_RE, (tag) => (++count <= max ? tag : ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function youtubeTitle(input: CaptionInput): string {
  const fromCaption = input.caption.split("\n").find((line) => line.trim()) ?? "";
  const raw = (input.title.trim() || fromCaption.replace(HASHTAG_RE, "").trim() || "New video")
    .replace(/[<>]/g, "");
  return truncate(raw, 100);
}

export function youtubeTags(caption: string): string[] {
  const tags: string[] = [];
  let total = 0;
  for (const tag of extractHashtags(caption).map((t) => t.slice(1))) {
    if (total + tag.length + 1 > 500) break;
    tags.push(tag);
    total += tag.length + 1;
  }
  return tags;
}

/** The text each platform receives for a post. */
export function captionFor(platform: Platform, input: CaptionInput): string {
  const link = input.link && input.linkInCaption ? input.link : null;
  const body = input.caption.trim();
  const withLink = link ? `${body}${body ? "\n\n" : ""}${link}` : body;

  switch (platform) {
    case "instagram":
      // Links in Instagram captions aren't clickable; a keyword DM automation is the way to deliver them.
      return truncate(capHashtags(withLink, INSTAGRAM_MAX_HASHTAGS), 2200);
    case "facebook":
      return truncate(withLink, 63000);
    case "tiktok":
      return truncate(withLink, 2200);
    case "youtube":
      return truncate(withLink.replace(/[<>]/g, ""), 5000);
    case "x": {
      if (!link) return truncateX(body, 280);
      const room = 280 - 23 - 2; // link + blank line
      return `${truncateX(body, room)}${body ? "\n\n" : ""}${link}`;
    }
  }
}
