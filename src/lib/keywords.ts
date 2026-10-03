import type { AutomationRow, Platform } from "./types";

export function parseKeywords(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(",");
  return [...new Set(parts.map((k) => k.trim()).filter(Boolean))];
}

/**
 * Lowercases and turns punctuation into spaces so "LINK!!", "#link" and "link" all match "link".
 * Letters with their combining marks (Urdu, Hindi, Arabic...), digits and emoji are kept.
 */
function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\uFE0E\uFE0F\u200D]/g, "") // emoji variation selectors and joiners
    .replace(/[^\p{L}\p{M}\p{N}\p{Extended_Pictographic}\s]/gu, " ")
    .replace(/(\p{Extended_Pictographic})/gu, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Does `comment` trigger a rule with these keywords? Matches whole words, ignoring case and punctuation. */
export function keywordMatches(
  comment: string,
  keywords: string[],
  mode: AutomationRow["match_mode"],
): boolean {
  if (mode === "any") return comment.trim().length > 0;
  const text = normalize(comment);
  return keywords.some((raw) => {
    const keyword = normalize(raw);
    if (!keyword) return false;
    if (mode === "exact") return text === keyword;
    return ` ${text} `.includes(` ${keyword} `);
  });
}

export interface MatchContext {
  platform: Platform;
  /** Our internal post ID, if the comment is on a post published from this app. */
  postId: string | null;
}

/**
 * Picks the automation for a comment. Rules attached to the specific post win over
 * "every post" rules; among equals, the oldest rule wins so behaviour is stable.
 */
export function pickAutomation(
  comment: string,
  rules: AutomationRow[],
  ctx: MatchContext,
): AutomationRow | null {
  const candidates = rules
    .filter((r) => r.active)
    .filter((r) => (JSON.parse(r.platforms) as string[]).includes(ctx.platform))
    .filter((r) => r.post_id === null || r.post_id === ctx.postId)
    .filter((r) => keywordMatches(comment, JSON.parse(r.keywords) as string[], r.match_mode))
    .sort((a, b) => {
      const specificity = Number(b.post_id !== null) - Number(a.post_id !== null);
      return specificity || a.created_at - b.created_at;
    });
  return candidates[0] ?? null;
}

/** Fills {name} and {link} placeholders in a reply template. */
export function renderTemplate(
  template: string,
  vars: { name: string | null; link: string | null },
  includeLink: boolean,
): string {
  let out = template
    .replaceAll("{name}", vars.name ?? "there")
    .replaceAll("{link}", vars.link ?? "");
  if (includeLink && vars.link && !template.includes("{link}")) {
    out = `${out.trimEnd()}\n${vars.link}`;
  }
  return out.trim();
}
