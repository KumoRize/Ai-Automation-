import { describe, expect, it } from "vitest";
import { keywordMatches, parseKeywords, pickAutomation, renderTemplate } from "@/lib/keywords";
import type { AutomationRow } from "@/lib/types";

function rule(over: Partial<AutomationRow>): AutomationRow {
  return {
    id: "r",
    name: "rule",
    post_id: null,
    platforms: JSON.stringify(["instagram", "facebook"]),
    keywords: JSON.stringify(["link"]),
    match_mode: "contains",
    public_reply: "",
    dm_message: "Here: {link}",
    include_link: 1,
    active: 1,
    trigger_count: 0,
    created_at: 1,
    ...over,
  };
}

describe("keywordMatches", () => {
  it("matches whole words regardless of case and punctuation", () => {
    expect(keywordMatches("Can I get the LINK?!", ["link"], "contains")).toBe(true);
    expect(keywordMatches("link🔥", ["link"], "contains")).toBe(true);
    expect(keywordMatches("unlinked", ["link"], "contains")).toBe(false);
  });

  it("supports multi-word keywords and exact mode", () => {
    expect(keywordMatches("send me the free guide please", ["free guide"], "contains")).toBe(true);
    expect(keywordMatches("Guide", ["guide"], "exact")).toBe(true);
    expect(keywordMatches("guide please", ["guide"], "exact")).toBe(false);
  });

  it("'any' matches every non-empty comment", () => {
    expect(keywordMatches("nice", [], "any")).toBe(true);
    expect(keywordMatches("  ", [], "any")).toBe(false);
  });
});

describe("pickAutomation", () => {
  it("prefers a rule attached to the post over an all-posts rule", () => {
    const general = rule({ id: "general", created_at: 1 });
    const specific = rule({ id: "specific", post_id: "p1", created_at: 2 });
    expect(pickAutomation("LINK", [general, specific], { platform: "instagram", postId: "p1" })?.id).toBe("specific");
    expect(pickAutomation("LINK", [general, specific], { platform: "instagram", postId: "p2" })?.id).toBe("general");
  });

  it("ignores paused rules and other platforms", () => {
    expect(pickAutomation("link", [rule({ active: 0 })], { platform: "instagram", postId: null })).toBeNull();
    expect(pickAutomation("link", [rule({})], { platform: "x", postId: null })).toBeNull();
  });
});

describe("renderTemplate", () => {
  it("fills placeholders", () => {
    expect(renderTemplate("Hi {name}: {link}", { name: "Sam", link: "https://a.co" }, true)).toBe("Hi Sam: https://a.co");
  });

  it("appends the link when the template doesn't mention it", () => {
    expect(renderTemplate("Hi {name}!", { name: null, link: "https://a.co" }, true)).toBe("Hi there!\nhttps://a.co");
    expect(renderTemplate("Hi!", { name: null, link: "https://a.co" }, false)).toBe("Hi!");
  });
});

describe("parseKeywords", () => {
  it("splits, trims and de-duplicates", () => {
    expect(parseKeywords(" LINK, guide ,,LINK")).toEqual(["LINK", "guide"]);
  });
});
