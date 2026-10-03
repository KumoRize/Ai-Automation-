import { requestJson } from "../platforms/http";
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

function textOf(res: GeminiResponse): string {
  if (res.promptFeedback?.blockReason) throw new Error("Gemini blocked this request. Try describing the post differently.");
  const candidate = res.candidates?.[0];
  if (candidate?.finishReason === "SAFETY") throw new Error("Gemini declined this request. Try describing the post differently.");
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/** Google Search grounding: free daily allowance on gemini-2.5-flash and flash-lite. */
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
  model: string,
  req: GenerateRequest,
): Promise<GeneratedContent> {
  let trends = { notes: "", sources: [] as { url: string; title: string }[] };
  if (req.liveTrends) {
    try {
      trends = await research(apiKey, model, req);
    } catch (err) {
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
