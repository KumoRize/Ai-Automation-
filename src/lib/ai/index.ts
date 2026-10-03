import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { PlatformError } from "../platforms/http";
import { generateBasic } from "./basic";
import { generateWithClaude } from "./claude";
import { generateWithGemini } from "./gemini";
import { generateWithOpenAICompatible } from "./openai-compatible";
import type { GeneratedContent, GenerateRequest } from "./schema";

export { GenerateRequest } from "./schema";
export type { GeneratedContent } from "./schema";

export type AiProvider = "gemini" | "groq" | "custom" | "ollama" | "claude";

/** Free options first; Claude (paid) is used only when its key is set. Basic mode is always last. */
const ORDER: AiProvider[] = ["gemini", "groq", "custom", "ollama", "claude"];

const LABELS: Record<AiProvider | "basic", string> = {
  gemini: "Google Gemini (free tier)",
  groq: "Groq (free tier)",
  custom: "Custom OpenAI-compatible API",
  ollama: "Ollama (free, on your computer)",
  claude: "Anthropic Claude",
  basic: "Basic mode (no AI key)",
};

function missing(p: AiProvider): string | null {
  const ai = config.ai;
  if (p === "gemini" && !ai.geminiKey) return "GEMINI_API_KEY is not set.";
  if (p === "groq" && !ai.groqKey) return "GROQ_API_KEY is not set.";
  if (p === "ollama" && !ai.ollamaModel) return "OLLAMA_MODEL is not set (for example llama3.1).";
  if (p === "custom" && !(ai.customBaseUrl && ai.customModel)) return "AI_BASE_URL and AI_MODEL must both be set.";
  if (p === "claude" && !ai.anthropicKey) return "ANTHROPIC_API_KEY is not set.";
  return null;
}

export interface AiStatus {
  /** Configured providers in the order they're tried. Empty means Basic mode only. */
  chain: AiProvider[];
  label: string;
  /** Whether the first provider can check live trends on the web. */
  liveTrends: boolean;
  /** Set when AI_PROVIDER is wrong or names a provider whose settings are missing. */
  problem: string | null;
}

export function aiStatus(): AiStatus {
  const wanted = config.ai.provider === "anthropic" ? "claude" : config.ai.provider;
  let problem: string | null = null;
  let chain = ORDER.filter((p) => !missing(p));
  if (wanted === "basic") {
    chain = [];
  } else if (wanted !== "auto") {
    if (!(ORDER as string[]).includes(wanted)) {
      problem = `Unknown AI_PROVIDER "${wanted}". Use gemini, groq, ollama, custom, claude or basic.`;
    } else if (missing(wanted as AiProvider)) {
      problem = `AI_PROVIDER is "${wanted}" but ${missing(wanted as AiProvider)}`;
    } else {
      chain = [wanted as AiProvider, ...chain.filter((p) => p !== wanted)];
    }
  }
  const first = chain[0];
  return {
    chain,
    label: first ? LABELS[first] + (chain.length > 1 ? `, with ${chain.slice(1).map((p) => LABELS[p]).join(", ")} as backup` : "") : LABELS.basic,
    liveTrends: first === "gemini" || first === "claude",
    problem,
  };
}

function errorStatus(err: unknown): number | undefined {
  if (err instanceof PlatformError) return err.status;
  if (err instanceof Anthropic.APIError) return err.status;
  return undefined;
}

/** Explains an AI failure in plain words. */
export function describeAiError(err: unknown): string {
  const status = errorStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status === 429) return "The AI usage limit was reached for now (free tiers reset after a minute or a day).";
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message)))
    return "The AI key was rejected. Check it on the Setup page.";
  if (status === 402 || /credit balance/i.test(message)) return "The AI account has no credit left.";
  if (status === 404) return "The AI model name wasn't found. Check the model setting on the Setup page.";
  if (status !== undefined) return `The AI service returned an error (${status}): ${message}`;
  if (err instanceof Anthropic.APIConnectionError || (err instanceof TypeError && /fetch failed/i.test(message)))
    return "Couldn't reach the AI service. If you use Ollama, make sure it is running.";
  return message;
}

async function generateWith(provider: AiProvider, req: GenerateRequest): Promise<GeneratedContent> {
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
    case "claude":
      return generateWithClaude(ai.anthropicKey!, ai.anthropicModel, req);
  }
}

/**
 * Tries each configured AI in turn. If all of them fail (or none is set up),
 * Basic mode fills in, so the user always gets usable results.
 */
export async function generateContent(req: GenerateRequest): Promise<GeneratedContent> {
  const failures: string[] = [];
  for (const provider of aiStatus().chain) {
    try {
      const out = await generateWith(provider, req);
      return failures.length ? { ...out, notice: `${failures.join(" ")} Used ${out.provider} instead.` } : out;
    } catch (err) {
      console.error(`[ai] ${provider} failed:`, err);
      failures.push(`${LABELS[provider]}: ${describeAiError(err)}`);
    }
  }
  const basic = generateBasic(req);
  return failures.length ? { ...basic, notice: `${failures.join(" ")} Showing Basic mode results instead.` } : basic;
}
