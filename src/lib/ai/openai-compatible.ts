import { PlatformError, requestJson } from "../platforms/http";
import { JSON_SHAPE, SYSTEM_PROMPT, userPrompt } from "./prompt";
import { extractJson, finalize, type GeneratedContent, type GenerateRequest } from "./schema";

/**
 * Works with any OpenAI-style chat API: Groq (free tier), Ollama (free, runs on your computer),
 * OpenRouter's free models, LM Studio, and others.
 */
export async function generateWithOpenAICompatible(
  opts: { baseUrl: string; apiKey?: string; model: string; label: string },
  req: GenerateRequest,
): Promise<GeneratedContent> {
  const headers: Record<string, string> = {};
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const body = {
    model: opts.model,
    temperature: 0.9,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${userPrompt(req, "")}\n\n${JSON_SHAPE}` },
    ],
  };

  type ChatResponse = { choices?: { message?: { content?: string } }[] };
  let res: ChatResponse;
  try {
    res = await requestJson<ChatResponse>(`${opts.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      json: { ...body, response_format: { type: "json_object" } },
    });
  } catch (err) {
    // Some models don't support JSON mode; the prompt already asks for JSON, so retry without it.
    if (!(err instanceof PlatformError) || err.status !== 400) throw err;
    res = await requestJson<ChatResponse>(`${opts.baseUrl}/chat/completions`, { method: "POST", headers, json: body });
  }
  const text = res.choices?.[0]?.message?.content ?? "";
  return finalize(extractJson(text), { provider: opts.label, liveChecked: false });
}
