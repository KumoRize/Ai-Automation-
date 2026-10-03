import { PlatformError, requestJson } from "../platforms/http";
import { JSON_SHAPE, researchPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt";
import { extractJson, finalize, type GeneratedContent, type GenerateRequest } from "./schema";

// Google's Gemini API has a free tier: create a key at https://aistudio.google.com/apikey (no card needed).
const API = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  promptFeedback?: { blockReason?: string };
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    hook: { type: "STRING" },
    caption: { type: "STRING" },
    title: { type: "STRING" },
    hashtags: { type: "ARRAY", items: { type: "STRING" } },
    keywords: { type: "ARRAY", items: { type: "STRING" } },
    styleNotes: { type: "STRING" },
  },
  required: ["hook", "caption", "title", "hashtags", "keywords", "styleNotes"],
  propertyOrdering: ["hook", "caption", "title", "hashtags", "keywords", "styleNotes"],
};

async function call(apiKey: string, model: string, body: unknown): Promise<GeminiResponse> {
  return requestJson<GeminiResponse>(`${API}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey },
    json: body,
  });
}

interface ModelList {
  models?: { name: string; supportedGenerationMethods?: string[] }[];
  nextPageToken?: string;
}

/** Ranks model names so the newest stable "flash" model wins (fast, and the one Google keeps free). */
export function pickGeminiModel(names: string[]): string | null {
  const version = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
  const bad = /lite|image|tts|audio|live|embedding|vision|robotics|computer|nano|exp|thinking/i;
  const score = (n: string) => {
    if (!/gemini-[\d.]+/.test(n) || bad.test(n)) return -1;
    if (/^gemini-[\d.]+-flash$/.test(n)) return 3; // stable flash, e.g. gemini-3.8-flash
    if (/flash/.test(n) && !/preview/.test(n)) return 2;
    if (/flash/.test(n)) return 1;
    return 0;
  };
  const ranked = names
    .map((n) => n.replace(/^models\//, ""))
    .filter((n) => score(n) >= 0)
    .sort((a, b) => score(b) - score(a) || version(b) - version(a));
  return ranked[0] ?? null;
}

const discovered = new Map<string, Promise<string>>();

/** Asks Google which models this key can use, so the app keeps working when Google retires one. */
function discoverModel(apiKey: string): Promise<string> {
  let found = discovered.get(apiKey);
  if (!found) {
    found = (async () => {
      const names: string[] = [];
      let page: string | undefined;
      do {
        const url = `${API}?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
        const res = await requestJson<ModelList>(url, { headers: { "x-goog-api-key": apiKey } });
        for (const m of res.models ?? []) {
          if (m.supportedGenerationMethods?.includes("generateContent")) names.push(m.name);
        }
        page = res.nextPageToken;
      } while (page);
      const best = pickGeminiModel(names);
      if (!best) throw new Error("No Gemini text model is available for this key.");
      console.log(`[ai] using Gemini model ${best}`);
      return best;
    })();
    found.catch(() => discovered.delete(apiKey)); // retry discovery next time if it failed
    discovered.set(apiKey, found);
  }
  return found;
}

function isRetiredModel(err: unknown): boolean {
  return err instanceof PlatformError && err.status === 404;
}

function textOf(res: GeminiResponse): string {
  if (res.promptFeedback?.blockReason) throw new Error("Gemini blocked this request. Try describing the post differently.");
  const candidate = res.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") throw new Error("Gemini declined this request. Try describing the post differently.");
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/** Google Search grounding. Free allowances depend on the model and account; failures are non-fatal. */
async function research(apiKey: string, model: string, req: GenerateRequest) {
  const res = await call(apiKey, model, {
    contents: [{ role: "user", parts: [{ text: researchPrompt(req) }] }],
    tools: [{ google_search: {} }],
  });
  const sources = new Map<string, string>();
  for (const chunk of res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
    if (chunk.web?.uri) sources.set(chunk.web.uri, chunk.web.title ?? chunk.web.uri);
  }
  return { notes: textOf(res), sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })) };
}

export async function generateWithGemini(
  apiKey: string,
  /** A model chosen in GEMINI_MODEL, or undefined to pick the newest available one automatically. */
  configuredModel: string | undefined,
  req: GenerateRequest,
): Promise<GeneratedContent> {
  let model = configuredModel ?? (await discoverModel(apiKey));
  try {
    return await write(apiKey, model, req);
  } catch (err) {
    // Google retires models for new keys; when the chosen one is gone, switch to the newest available.
    if (!isRetiredModel(err)) throw err;
    discovered.delete(apiKey);
    const replacement = await discoverModel(apiKey);
    if (replacement === model) throw err;
    console.warn(`[ai] Gemini model ${model} is unavailable; switching to ${replacement}.`);
    model = replacement;
    return write(apiKey, model, req);
  }
}

async function write(apiKey: string, model: string, req: GenerateRequest): Promise<GeneratedContent> {
  let trends = { notes: "", sources: [] as { url: string; title: string }[] };
  if (req.liveTrends) {
    try {
      trends = await research(apiKey, model, req);
    } catch (err) {
      if (isRetiredModel(err)) throw err;
      // Search quota can run out on the free tier; still write the post without it.
      console.warn("[ai] Gemini trend search failed, continuing without it:", err);
    }
  }
  // Gemini can't combine Google Search with JSON output in one call, so writing is a second request.
  const res = await call(apiKey, model, {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: `${userPrompt(req, trends.notes)}\n\n${JSON_SHAPE}` }] }],
    generationConfig: {
      temperature: 0.9,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });
  return finalize(extractJson(textOf(res)), {
    sources: trends.sources,
    provider: `Google Gemini (${model})`,
    liveChecked: Boolean(trends.notes),
  });
}
