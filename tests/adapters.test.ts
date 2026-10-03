import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { aiStatus, generateContent } from "@/lib/ai";
import { generateBasic } from "@/lib/ai/basic";
import { generateWithClaude } from "@/lib/ai/claude";
import { generateWithGemini, pickGeminiModel, resetGeminiSearchPause } from "@/lib/ai/gemini";
import { generateWithOpenAICompatible } from "@/lib/ai/openai-compatible";
import { extractJson } from "@/lib/ai/schema";
import { config } from "@/lib/config";
import { uploadsDir } from "@/lib/media";
import { facebook } from "@/lib/platforms/facebook";
import { instagram } from "@/lib/platforms/instagram";
import { tiktok } from "@/lib/platforms/tiktok";
import type { AccountCredentials } from "@/lib/platforms/types";
import { x } from "@/lib/platforms/x";
import { youtube } from "@/lib/platforms/youtube";
import type { PostRow } from "@/lib/types";

// These tests replace fetch with a fake and check the requests each integration sends.
// They prove the request flow and parsing; they can't prove the real services accept them.

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string | FormData | null;
}

const calls: Call[] = [];

async function bodyOf(init?: RequestInit): Promise<string | FormData | null> {
  const b = init?.body;
  if (!b) return null;
  if (typeof b === "string") return b;
  if (b instanceof FormData) return b;
  return await new Response(b as BodyInit).text();
}

function fakeFetch(handler: (call: Call, index: number) => Response) {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: await bodyOf(init),
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  });
}

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" }, ...init });

const creds: AccountCredentials = {
  externalId: "acct-1",
  username: "@creator",
  accessToken: "token-123",
  refreshToken: null,
  meta: {},
};

const MEDIA_SIZE = 2048;

function post(over: Partial<PostRow>): PostRow {
  return {
    id: "p1",
    title: "My title",
    caption: "Caption #one #two",
    link: null,
    link_in_caption: 1,
    media_file: null,
    media_type: "none",
    media_mime: null,
    media_size: null,
    status: "publishing",
    scheduled_at: null,
    created_at: 0,
    ...over,
  };
}

beforeAll(() => {
  for (const name of ["test-image.jpg", "test-image.png", "test-video.mp4"]) {
    fs.writeFileSync(path.join(uploadsDir(), name), Buffer.alloc(MEDIA_SIZE, 1));
  }
});

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

const image = { media_file: "test-image.jpg", media_type: "image" as const, media_mime: "image/jpeg", media_size: MEDIA_SIZE };
const video = { media_file: "test-video.mp4", media_type: "video" as const, media_mime: "video/mp4", media_size: MEDIA_SIZE };

describe("Instagram", () => {
  it("creates a container, waits for it, publishes, and reads the permalink", async () => {
    fakeFetch((c) => {
      if (c.url.endsWith("/acct-1/media")) return json({ id: "container-1" });
      if (c.url.includes("/container-1?")) return json({ status_code: "FINISHED" });
      if (c.url.endsWith("/acct-1/media_publish")) return json({ id: "media-9" });
      if (c.url.includes("/media-9?")) return json({ permalink: "https://instagram.com/p/abc" });
      return json({}, { status: 404 });
    });
    const res = await instagram.publish(creds, { post: post(image), text: "hello" });
    expect(res).toEqual({ externalId: "media-9", url: "https://instagram.com/p/abc" });
    const create = new URLSearchParams(calls[0].body as string);
    expect(create.get("image_url")).toMatch(/\/media\/test-image\.jpg$/);
    expect(create.get("caption")).toBe("hello");
    expect(new URLSearchParams(calls[2].body as string).get("creation_id")).toBe("container-1");
  });

  it("posts videos as Reels", async () => {
    fakeFetch((c) => {
      if (c.url.endsWith("/acct-1/media")) return json({ id: "c2" });
      if (c.url.includes("/c2?")) return json({ status_code: "FINISHED" });
      if (c.url.endsWith("/acct-1/media_publish")) return json({ id: "m2" });
      return json({});
    });
    await instagram.publish(creds, { post: post(video), text: "v" });
    const create = new URLSearchParams(calls[0].body as string);
    expect(create.get("media_type")).toBe("REELS");
    expect(create.get("video_url")).toMatch(/test-video\.mp4$/);
  });

  it("refuses PNG and text-only posts before calling the API", async () => {
    fakeFetch(() => json({}));
    await expect(
      instagram.publish(creds, { post: post({ ...image, media_file: "test-image.png", media_mime: "image/png" }), text: "x" }),
    ).rejects.toThrow(/JPEG/);
    await expect(instagram.publish(creds, { post: post({}), text: "x" })).rejects.toThrow(/image or a video/);
    expect(calls).toHaveLength(0);
  });

  it("surfaces Meta's error message", async () => {
    fakeFetch(() => json({ error: { message: "Invalid OAuth access token." } }, { status: 400 }));
    await expect(instagram.publish(creds, { post: post(image), text: "x" })).rejects.toThrow("Invalid OAuth access token.");
  });
});

describe("Facebook", () => {
  it("posts text with the link as a preview when it isn't in the caption", async () => {
    fakeFetch(() => json({ id: "acct-1_55" }));
    const res = await facebook.publish(creds, {
      post: post({ link: "https://a.co", link_in_caption: 0 }),
      text: "hi",
    });
    expect(calls[0].url).toMatch(/\/acct-1\/feed$/);
    const form = new URLSearchParams(calls[0].body as string);
    expect(form.get("link")).toBe("https://a.co");
    expect(res.externalId).toBe("acct-1_55");
  });

  it("uses the photo endpoint for images", async () => {
    fakeFetch(() => json({ id: "photo1", post_id: "acct-1_77" }));
    const res = await facebook.publish(creds, { post: post(image), text: "pic" });
    expect(calls[0].url).toMatch(/\/acct-1\/photos$/);
    expect(res.externalId).toBe("acct-1_77");
  });
});

describe("YouTube", () => {
  it("starts a resumable upload and streams the file to it", async () => {
    fakeFetch((c) => {
      if (c.url.includes("uploadType=resumable"))
        return new Response(null, { status: 200, headers: { location: "https://upload.example/session-1" } });
      if (c.url === "https://upload.example/session-1") return json({ id: "vid123" });
      return json({}, { status: 404 });
    });
    const res = await youtube.publish(creds, { post: post({ ...video, title: "" }), text: "desc" });
    expect(res).toEqual({ externalId: "vid123", url: "https://www.youtube.com/watch?v=vid123" });
    const meta = JSON.parse(calls[0].body as string);
    expect(meta.snippet.title).toBe("Caption");
    expect(meta.snippet.tags).toEqual(["one", "two"]);
    expect(calls[0].headers.get("x-upload-content-length")).toBe(String(MEDIA_SIZE));
    expect(calls[1].method).toBe("PUT");
    expect((calls[1].body as string).length).toBe(MEDIA_SIZE);
  });

  it("returns only new top-level comments and skips the channel's own", async () => {
    fakeFetch(() =>
      json({
        items: [
          { id: "t1", snippet: { topLevelComment: { id: "c1", snippet: { textOriginal: "link?", authorDisplayName: "Sam", authorChannelId: { value: "fan" }, publishedAt: "2026-10-01T10:00:00Z" } } } },
          { id: "t2", snippet: { topLevelComment: { id: "c2", snippet: { textOriginal: "thanks", authorDisplayName: "Me", authorChannelId: { value: "acct-1" }, publishedAt: "2026-10-01T11:00:00Z" } } } },
          { id: "t3", snippet: { topLevelComment: { id: "c3", snippet: { textOriginal: "old", authorDisplayName: "Old", authorChannelId: { value: "x" }, publishedAt: "2026-09-01T10:00:00Z" } } } },
        ],
      }),
    );
    const res = await youtube.pollComments!(creds, "vid123", "2026-09-30T00:00:00Z");
    expect(res.comments.map((c) => c.commentId)).toEqual(["c1"]);
    expect(res.cursor).toBe("2026-10-01T11:00:00Z");
  });
});

describe("TikTok", () => {
  it("checks privacy, uploads the video with a Content-Range, and waits for publishing", async () => {
    fakeFetch((c) => {
      if (c.url.includes("creator_info")) return json({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
      if (c.url.includes("/video/init/"))
        return json({ data: { publish_id: "pub1", upload_url: "https://upload.tiktok.example/u1" }, error: { code: "ok" } });
      if (c.url.startsWith("https://upload.tiktok.example")) return new Response(null, { status: 201 });
      if (c.url.includes("status/fetch")) return json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [987] }, error: { code: "ok" } });
      return json({}, { status: 404 });
    });
    const res = await tiktok.publish(creds, { post: post(video), text: "clip" });
    expect(res.externalId).toBe("987");
    const init = JSON.parse(calls[1].body as string);
    expect(init.post_info.privacy_level).toBe("SELF_ONLY");
    expect(init.source_info).toEqual({ source: "FILE_UPLOAD", video_size: MEDIA_SIZE, chunk_size: MEDIA_SIZE, total_chunk_count: 1 });
    expect(calls[2].headers.get("content-range")).toBe(`bytes 0-${MEDIA_SIZE - 1}/${MEDIA_SIZE}`);
  });

  it("reports TikTok errors sent with HTTP 200", async () => {
    fakeFetch(() => json({ data: {}, error: { code: "access_token_invalid", message: "The access token is invalid." } }));
    await expect(tiktok.publish(creds, { post: post(video), text: "clip" })).rejects.toThrow("The access token is invalid.");
  });

  it("refuses PNG photos", async () => {
    fakeFetch((c) =>
      c.url.includes("creator_info") ? json({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } }) : json({}),
    );
    await expect(
      tiktok.publish(creds, { post: post({ ...image, media_file: "test-image.png", media_mime: "image/png" }), text: "x" }),
    ).rejects.toThrow(/JPEG/);
  });
});

describe("X", () => {
  it("uploads media in chunks, then posts with the media ID", async () => {
    fakeFetch((c) => {
      if (c.url.endsWith("/media/upload/initialize")) return json({ data: { id: "m1" } });
      if (c.url.endsWith("/media/upload/m1/append")) return new Response(null, { status: 204 });
      if (c.url.endsWith("/media/upload/m1/finalize")) return json({ data: { id: "m1" } });
      if (c.url.endsWith("/tweets")) return json({ data: { id: "t1" } });
      return json({}, { status: 404 });
    });
    const res = await x.publish(creds, { post: post(image), text: "hi" });
    expect(res).toEqual({ externalId: "t1", url: "https://x.com/creator/status/t1" });
    expect(JSON.parse(calls[0].body as string)).toEqual({ media_type: "image/jpeg", total_bytes: MEDIA_SIZE, media_category: "tweet_image" });
    const append = calls[1].body as FormData;
    expect(append.get("segment_index")).toBe("0");
    expect((append.get("media") as Blob).size).toBe(MEDIA_SIZE);
    expect(JSON.parse(calls[3].body as string)).toEqual({ text: "hi", media: { media_ids: ["m1"] } });
  });

  it("posts text-only without uploading", async () => {
    fakeFetch(() => json({ data: { id: "t2" } }));
    await x.publish(creds, { post: post({}), text: "just text" });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].body as string)).toEqual({ text: "just text" });
  });
});

const aiReq = { topic: "morning skincare", style: "Witty", platforms: [], language: "English", liveTrends: true };
const modelJson = {
  hook: "Hook",
  caption: "Caption text",
  title: "Title",
  hashtags: ["skincare", "#glow", "#skincare"],
  keywords: ["skin care routine", "#glow"],
  styleNotes: "Playful.",
};

describe("Gemini (free tier)", () => {
  it("researches with Google Search, then asks for JSON, and returns sources", async () => {
    fakeFetch((c, i) => {
      if (i === 0)
        return json({
          candidates: [
            {
              content: { parts: [{ text: "- #glowup is trending" }] },
              groundingMetadata: { groundingChunks: [{ web: { uri: "https://src.example", title: "Source" } }] },
            },
          ],
        });
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
    });
    const out = await generateWithGemini("key-1", "gemini-2.5-flash", aiReq);
    expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(calls[0].headers.get("x-goog-api-key")).toBe("key-1");
    expect(JSON.parse(calls[0].body as string).tools).toEqual([{ google_search: {} }]);
    const second = JSON.parse(calls[1].body as string);
    expect(second.generationConfig.responseMimeType).toBe("application/json");
    expect(second.contents[0].parts[0].text).toContain("#glowup is trending");
    expect(out.hashtags).toEqual(["#skincare", "#glow"]);
    expect(out.keywords).toEqual(["skin care routine", "glow"]);
    expect(out.sources).toEqual([{ url: "https://src.example", title: "Source" }]);
    expect(out.liveChecked).toBe(true);
  });

  it("still writes the post when the free search quota is used up", async () => {
    fakeFetch((c) =>
      String(c.body).includes("google_search")
        ? json({ error: { code: 429, message: "Quota exceeded" } }, { status: 429 })
        : json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] }),
    );
    const out = await generateWithGemini("key-1", "gemini-2.5-flash", aiReq);
    expect(out.caption).toBe("Caption text");
    expect(out.liveChecked).toBe(false);
    expect(out.notice).toMatch(/isn't included in your free Gemini plan/);

    // The next request skips the search instead of failing on it again.
    calls.length = 0;
    const again = await generateWithGemini("key-1", "gemini-2.5-flash", aiReq);
    expect(calls).toHaveLength(1);
    expect(again.notice).toMatch(/free Gemini plan/);
    resetGeminiSearchPause();
  });
});

describe("Gemini model selection", () => {
  it("prefers the newest stable flash model and skips special-purpose ones", () => {
    expect(
      pickGeminiModel([
        "models/gemini-2.5-flash",
        "models/gemini-3.8-flash",
        "models/gemini-3.8-flash-lite",
        "models/gemini-3.9-flash-image",
        "models/gemini-3.9-pro-preview",
        "models/gemini-embedding-001",
      ]),
    ).toBe("gemini-3.8-flash");
    expect(pickGeminiModel(["models/gemini-4.0-flash-preview", "models/gemini-3.1-pro"])).toBe("gemini-4.0-flash-preview");
    expect(pickGeminiModel(["models/text-embedding-004"])).toBeNull();
  });

  it("looks up available models when none is configured", async () => {
    fakeFetch((c) => {
      if (c.method === "GET")
        return json({
          models: [
            { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
          ],
        });
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
    });
    const out = await generateWithGemini("key-discover", undefined, { ...aiReq, liveTrends: false });
    expect(calls[0].url).toMatch(/\/v1beta\/models\?pageSize=1000$/);
    expect(calls[1].url).toContain("/models/gemini-3.8-flash:generateContent");
    expect(out.provider).toBe("Google Gemini (gemini-3.8-flash)");
  });

  it("switches to an available model when Google has retired the configured one", async () => {
    fakeFetch((c) => {
      if (c.url.includes("gemini-2.5-flash:"))
        return json({ error: { code: 404, message: "This model models/gemini-2.5-flash is no longer available to new users." } }, { status: 404 });
      if (c.method === "GET")
        return json({ models: [{ name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] }] });
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson) }] } }] });
    });
    const out = await generateWithGemini("key-retired", "gemini-2.5-flash", aiReq);
    expect(out.provider).toBe("Google Gemini (gemini-3.8-flash)");
    expect(out.caption).toBe("Caption text");
  });
});

describe("OpenAI-compatible (Groq, Ollama, OpenRouter)", () => {
  it("retries without JSON mode when the model doesn't support it, and reads fenced JSON", async () => {
    fakeFetch((_c, i) =>
      i === 0
        ? json({ error: { message: "response_format not supported" } }, { status: 400 })
        : json({ choices: [{ message: { content: "Sure!\n```json\n" + JSON.stringify(modelJson) + "\n```" } }] }),
    );
    const out = await generateWithOpenAICompatible(
      { baseUrl: "https://api.groq.com/openai/v1", apiKey: "gk", model: "llama-3.3-70b-versatile", label: "Groq" },
      aiReq,
    );
    expect(calls[0].headers.get("authorization")).toBe("Bearer gk");
    expect(JSON.parse(calls[0].body as string).response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(calls[1].body as string).response_format).toBeUndefined();
    expect(out.title).toBe("Title");
    expect(out.provider).toBe("Groq");
  });
});

describe("Basic mode (no key)", () => {
  it("builds hashtags and keywords from the topic", () => {
    const out = generateBasic({ ...aiReq, topic: "Easy vegan pasta recipe for busy weeknights", platforms: ["instagram"] });
    expect(out.hashtags).toContain("#vegan");
    expect(out.hashtags).toContain("#veganpasta");
    expect(out.hashtags).toContain("#reels");
    expect(out.keywords).toContain("vegan pasta");
    expect(out.caption).toMatch(/easy vegan pasta recipe/i);
    expect(out.title).toBe("Easy vegan pasta recipe for busy weeknights");
  });

  it("lowercases the topic mid-sentence but keeps acronyms", () => {
    expect(generateBasic({ ...aiReq, topic: "Homemade biryani", style: "Storytelling" }).hook).toBe(
      "I didn't expect homemade biryani to change my week.",
    );
    expect(generateBasic({ ...aiReq, topic: "AI tools for creators", style: "Storytelling" }).hook).toBe(
      "I didn't expect AI tools for creators to change my week.",
    );
  });

  it("keeps Urdu and Hindi words whole", () => {
    const out = generateBasic({ ...aiReq, topic: "مزیدار بریانی ریسیپی", style: "" });
    expect(out.hashtags).toContain("#بریانی");
    const hindi = generateBasic({ ...aiReq, topic: "स्वादिष्ट बिरयानी", style: "" });
    expect(hindi.hashtags).toContain("#बिरयानी");
  });
});

describe("extractJson", () => {
  it("finds JSON inside surrounding text", () => {
    expect(extractJson('Here you go: {"a": 1} hope it helps')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("Claude", () => {
  const claudeMessage = (text: string) =>
    json({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 10 },
    });

  it("asks for structured output with refusal fallbacks and parses it", async () => {
    fakeFetch(() => claudeMessage(JSON.stringify(modelJson)));
    const out = await generateWithClaude("sk-test", "claude-opus-5-5", { ...aiReq, liveTrends: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("api.anthropic.com/v1/messages");
    expect(calls[0].headers.get("x-api-key")).toBe("sk-test");
    expect(calls[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const body = JSON.parse(calls[0].body as string);
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(out.caption).toBe("Caption text");
    expect(out.provider).toBe("Anthropic Claude (claude-opus-5-5)");
  });
});

describe("AI failover", () => {
  const saved = { ...config.ai };
  afterEach(() => Object.assign(config.ai, saved));

  it("lists configured providers free-first and falls back to the next one", async () => {
    Object.assign(config.ai, { provider: "auto", geminiKey: "g", anthropicKey: "a", groqKey: undefined });
    expect(aiStatus().chain).toEqual(["gemini", "claude"]);
    fakeFetch((c) =>
      c.url.includes("generativelanguage")
        ? json({ error: { code: 429, message: "Resource exhausted" } }, { status: 429 })
        : json({
            id: "m", type: "message", role: "assistant", model: "claude-opus-5-5",
            content: [{ type: "text", text: JSON.stringify(modelJson) }],
            stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
          }),
    );
    const out = await generateContent({ ...aiReq, liveTrends: false });
    expect(out.provider).toMatch(/Claude/);
    expect(out.notice).toMatch(/Gemini.*limit/);
  });

  it("uses Basic mode with an explanation when every provider fails", async () => {
    Object.assign(config.ai, { provider: "auto", geminiKey: "bad", anthropicKey: undefined, groqKey: undefined });
    fakeFetch(() => json({ error: { code: 400, message: "API key not valid." } }, { status: 400 }));
    const out = await generateContent({ ...aiReq, liveTrends: false });
    expect(out.provider).toMatch(/Basic/);
    expect(out.notice).toMatch(/key was rejected/);
  });

  it("puts the provider named in AI_PROVIDER first and reports bad names", () => {
    Object.assign(config.ai, { provider: "claude", geminiKey: "g", anthropicKey: "a" });
    expect(aiStatus().chain).toEqual(["claude", "gemini"]);
    Object.assign(config.ai, { provider: "chatgpt" });
    expect(aiStatus().problem).toMatch(/Unknown AI_PROVIDER/);
    Object.assign(config.ai, { provider: "basic" });
    expect(aiStatus().chain).toEqual([]);
  });
});

describe("connection checks", () => {
  it("each platform reads the account name with the saved token", async () => {
    fakeFetch((c) => {
      if (c.url.includes("graph.instagram.com")) return json({ username: "creator" });
      if (c.url.includes("graph.facebook.com")) return json({ name: "My Page" });
      if (c.url.includes("open.tiktokapis.com")) return json({ data: { user: { display_name: "Tik Name" } }, error: { code: "ok" } });
      if (c.url.includes("googleapis.com/youtube")) return json({ items: [{ snippet: { title: "My Channel" } }] });
      if (c.url.includes("api.x.com")) return json({ data: { username: "creator" } });
      return json({}, { status: 404 });
    });
    expect(await instagram.verify(creds)).toBe("@creator");
    expect(await facebook.verify(creds)).toBe("My Page");
    expect(await tiktok.verify(creds)).toBe("Tik Name");
    expect(await youtube.verify(creds)).toBe("My Channel");
    expect(await x.verify(creds)).toBe("@creator");
  });
});
