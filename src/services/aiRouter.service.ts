import { logger } from "../utils/logger";
import { generateStream } from "./llm.service";

// ── Router Result ──────────────────────────────────────────────
export interface RouterResult {
  fullText: string;
  modelUsed: "groq" | "ollama"; // Updated from gemini to groq
  fallbackUsed: boolean;
}

// ── Main Router (Simplified) ───────────────────────────────────
/**
 * Now delegates everything to llm.service.ts which handles
 * the Groq -> Ollama fallback logic internally.
 * 
 * Maintains signature to avoid breaking chat controller.
 */
export async function routedGenerateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: {
    primaryMaxTokens?: number; // Renamed from geminiMaxTokens
    ollamaMaxTokens?: number;
    temperature?: number;
  } = {},
  signal?: AbortSignal
): Promise<RouterResult> {
  logger.info("🚀 Router: delegating to LLM Service");

  const result = await generateStream(
    prompt,
    onChunk,
    {
      maxTokens: options.primaryMaxTokens ?? 250,
      temperature: options.temperature ?? 0.7,
    },
    signal
  );

  return {
    fullText: result.fullText,
    modelUsed: result.modelUsed,
    fallbackUsed: result.fallbackUsed
  };
}
