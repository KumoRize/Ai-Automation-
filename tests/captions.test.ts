import { describe, expect, it } from "vitest";
import { captionFor, extractHashtags, normalizeHashtags, xWeightedLength, youtubeTags, youtubeTitle } from "@/lib/captions";

const base = { title: "", caption: "", link: null, linkInCaption: true };

describe("hashtags", () => {
  it("extracts unique hashtags, including non-Latin ones", () => {
    expect(extractHashtags("Morning #skincare routine #SkinCare #スキンケア #skincare")).toEqual([
      "#skincare",
      "#SkinCare",
      "#スキンケア",
    ]);
  });

  it("normalizes user-typed tags", () => {
    expect(normalizeHashtags("fitness, #gym  ##workout #gym")).toEqual(["#fitness", "#gym", "#workout"]);
  });
});

describe("X length", () => {
  it("counts URLs as 23 and emoji as 2", () => {
    expect(xWeightedLength("hi https://example.com/a/very/long/path")).toBe(3 + 23);
    expect(xWeightedLength("🔥")).toBe(2);
  });

  it("shortens long captions but keeps the link intact", () => {
    const text = captionFor("x", { ...base, caption: "a".repeat(400), link: "https://shop.example.com/p/1" });
    expect(text.endsWith("https://shop.example.com/p/1")).toBe(true);
    expect(xWeightedLength(text)).toBeLessThanOrEqual(280);
    expect(text).toContain("…");
  });

  it("leaves short captions alone", () => {
    expect(captionFor("x", { ...base, caption: "Short and sweet" })).toBe("Short and sweet");
  });
});

describe("per-platform captions", () => {
  it("appends the link when asked", () => {
    expect(captionFor("facebook", { ...base, caption: "New drop", link: "https://a.co" })).toBe("New drop\n\nhttps://a.co");
    expect(captionFor("facebook", { ...base, caption: "New drop", link: "https://a.co", linkInCaption: false })).toBe("New drop");
  });

  it("keeps only the first 5 hashtags on Instagram (its limit since Dec 2025)", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `#tag${i}`).join(" ");
    const text = captionFor("instagram", { ...base, caption: `Hello ${tags}` });
    expect(extractHashtags(text)).toEqual(["#tag0", "#tag1", "#tag2", "#tag3", "#tag4"]);
    expect(extractHashtags(captionFor("facebook", { ...base, caption: tags }))).toHaveLength(12);
  });

  it("keeps hashtags in scripts with combining marks whole", () => {
    expect(extractHashtags("#बिरयानी #بریانی")).toEqual(["#बिरयानी", "#بریانی"]);
  });

  it("strips angle brackets YouTube rejects", () => {
    expect(captionFor("youtube", { ...base, caption: "a <b> c" })).toBe("a b c");
  });
});

describe("YouTube metadata", () => {
  it("falls back to the first caption line without hashtags for the title", () => {
    expect(youtubeTitle({ ...base, caption: "\nMy best recipe #food\nmore" })).toBe("My best recipe");
    expect(youtubeTitle({ ...base, title: "Custom" })).toBe("Custom");
    expect([...youtubeTitle({ ...base, title: "x".repeat(150) })]).toHaveLength(100);
  });

  it("turns hashtags into tags under 500 characters", () => {
    expect(youtubeTags("#one #two")).toEqual(["one", "two"]);
    const many = Array.from({ length: 100 }, (_, i) => `#longtagnumber${i}`).join(" ");
    expect(youtubeTags(many).join(",").length).toBeLessThanOrEqual(500);
  });
});
