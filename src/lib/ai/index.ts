import { config } from "../config";
import { PlatformError } from "../platforms/http";
import { generateBasic } from "./basic";
import { generateWithGemini } from "./gemini";
import { generateWithOpenAICompatible } from "./openai-compatible";
import type { GeneratedContent, GenerateRequest } from "./schema";

export { GenerateRequest } from "./schema";
export type { GeneratedContent } from "./schema";

export type AiProvider = "gemini" | "groq" | "ollama" | "custom" | "basic";

export interface AiStatus {
  provider: AiProvider;
  label: string;
  /** Can this provider check live trends on the web? */
  liveTrends: boolean;
  /** Set when AI_PROVIDER names a provider whose settings are missing. */
  problem: string | null;
}

const LABELS: Record<AiProvider, string> = {
  gemini: "Google Gemini (free tier)",
  groq: "Groq (free tier)",
  ollama: "Ollama (free, on your computer)",
  custom: "Custom OpenAI-compatible API",
  basic: "Basic mode (no AI key)",
};

function ready(p: AiProvider): string | null {
  const ai = config.ai;
  if (p === "gemini" && !ai.geminiKey) return "GEMINI_API_KEY is not set.";
  if (p === "groq" && !ai.groqKey) return "GROQ_API_KEY is not set.";
  if (p === "ollama" && !ai.ollamaModel) return "OLLAMA_MODEL is not set (for example llama3.1).";
  if (p === "custom" && !(ai.customBaseUrl && ai.customModel)) return "AI_BASE_URL and AI_MODEL must both be set.";
  return null;
}

export function aiStatus(): AiStatus {
  const wanted = config.ai.provider as AiProvider | "auto";
  let provider: AiProvider;
  let problem: string | null = null;
  if (wanted !== "auto" && wanted in LABELS) {
    problem = ready(wanted);
    provider = problem ? "basic" : wanted;
  } else {
    if (wanted !== "auto") problem = `Unknown AI_PROVIDER "${wanted}". Use gemini, groq, ollama, custom or basic.`;
    provider = (["gemini", "groq", "custom", "ollama"] as const).find((p) => !ready(p)) ?? "basic";
  }
  return { provider, label: LABELS[provider], liveTrends: provider === "gemini", problem };
}

/** Explains an AI failure in plain words. */
export function describeAiError(err: unknown): string {
  if (err instanceof PlatformError) {
    if (err.status === 429) return "The free AI limit was reached for now (it resets after a minute, or daily).";
    if (err.status === 401 || err.status === 403 || (err.status === 400 && /api key/i.test(err.message)))
      return "The AI key was rejected. Check it on the Setup page.";
    if (err.status === 404) return "The AI model name wasn't found. Check the model setting on the Setup page.";
    return `The AI service returned an error: ${err.message}`;
  }
  if (err instanceof TypeError && /fetch failed/i.test(err.message))
    return "Couldn't reach the AI service. If you use Ollama, make sure it is running.";
  return err instanceof Error ? err.message : String(err);
}

/** Writes the content with the configured AI. If that fails, Basic mode fills in so the user still gets results. */
export async function generateContent(req: GenerateRequest): Promise<GeneratedContent> {
  const { provider } = aiStatus();
  if (provider === "basic") return generateBasic(req);
  try {
    return await generateWith(provider, req);
  } catch (err) {
    console.error(`[ai] ${provider} failed, using Basic mode:`, err);
    return { ...generateBasic(req), notice: `${describeAiError(err)} Showing Basic mode results instead.` };
  }
}

async function generateWith(provider: Exclude<AiProvider, "basic">, req: GenerateRequest): Promise<GeneratedContent> {
  const ai = config.ai;
  switch (provider) {
    case "gemini":
      return generateWithGemini(ai.geminiKey!, ai.geminiModel, req);
    case "groq":
      return generateWithOpenAICompatible(
        { baseUrl: "https://api.groq.com/openai/v1", apiKey: ai.groqKey, model: ai.groqModel, label: `Groq (${ai.groqModel})` },
        req,
      );
    case "ollama":
      return generateWithOpenAICompatible(
        { baseUrl: `${ai.ollamaUrl}/v1`, model: ai.ollamaModel!, label: `Ollama (${ai.ollamaModel})` },
        req,
      );
    case "custom":
      return generateWithOpenAICompatible(
        { baseUrl: ai.customBaseUrl!, apiKey: ai.customKey, model: ai.customModel!, label: ai.customModel! },
        req,
      );
  }
}
