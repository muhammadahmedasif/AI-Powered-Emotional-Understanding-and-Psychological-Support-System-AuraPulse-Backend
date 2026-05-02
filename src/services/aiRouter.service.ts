import { logger } from "../utils/logger";
import {
  geminiGenerateStream,
  GeminiError,
} from "./gemini.service";
import { ollamaGenerateStream } from "./ollama.service";

// ── Router Result ──────────────────────────────────────────────
export interface RouterResult {
  fullText: string;
  modelUsed: "gemini" | "ollama";
  fallbackUsed: boolean;
}

// ── Safe Fallback Message ──────────────────────────────────────
const SAFE_FALLBACK_MESSAGE =
  "I'm having a little trouble responding right now. Please try again in a moment.";

// ── Main Router ────────────────────────────────────────────────
/**
 * Simple, linear routing:
 *   1. Call Gemini once
 *   2. If ANY error → fallback to Ollama
 *   3. If both fail → return safe message
 *
 * No retry loops. No cooldowns. No model guessing.
 */
export async function routedGenerateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: {
    geminiMaxTokens?: number;
    ollamaMaxTokens?: number;
    temperature?: number;
  } = {},
  signal?: AbortSignal
): Promise<RouterResult> {
  // ── Step 1: Try Gemini ──
  try {
    logger.info("🚀 Router: calling Gemini");

    const fullText = await geminiGenerateStream(
      prompt,
      onChunk,
      {
        maxOutputTokens: options.geminiMaxTokens ?? 250,
        temperature: options.temperature ?? 0.7,
      },
      signal
    );

    logger.info("✅ Router: Gemini succeeded");
    return { fullText, modelUsed: "gemini", fallbackUsed: false };
  } catch (geminiError) {
    logger.warn("⚠️ Router: Gemini failed → using Ollama fallback", {
      error:
        geminiError instanceof Error ? geminiError.message : String(geminiError),
    });
  }

  // ── Step 2: Fallback to Ollama ──
  try {
    logger.info("🔄 Router: calling Ollama");

    const fullText = await ollamaGenerateStream(
      prompt,
      onChunk,
      {
        num_predict: options.ollamaMaxTokens ?? 150,
        temperature: options.temperature ?? 0.7,
      },
      signal
    );

    logger.info("✅ Router: Ollama succeeded");
    return { fullText, modelUsed: "ollama", fallbackUsed: true };
  } catch (ollamaError) {
    logger.error("🔴 Router: both Gemini and Ollama failed", {
      error:
        ollamaError instanceof Error
          ? ollamaError.message
          : String(ollamaError),
    });
  }

  // ── Step 3: Safe fallback ──
  onChunk(SAFE_FALLBACK_MESSAGE);
  return {
    fullText: SAFE_FALLBACK_MESSAGE,
    modelUsed: "ollama",
    fallbackUsed: true,
  };
}
