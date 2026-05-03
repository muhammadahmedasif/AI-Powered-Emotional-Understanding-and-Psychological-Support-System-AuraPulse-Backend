import Groq from "groq-sdk";
import { logger } from "../utils/logger";
import { ollamaGenerateStream, ollamaGenerate } from "./ollama.service";

// ── Configuration ──────────────────────────────────────────────
const GROQ_MODEL = "llama-3.1-8b-instant";
const GROQ_TIMEOUT_MS = 15_000;

// ── SDK Initialization ─────────────────────────────────────────
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

// ── Types ──────────────────────────────────────────────────────
export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResult {
  fullText: string;
  modelUsed: "groq" | "ollama";
  fallbackUsed: boolean;
}

// ── Main Streaming Generation (with Fallback) ──────────────────
/**
 * Primary: Groq (llama-3.1-8b-instant)
 * Fallback: Ollama (local model)
 * 
 * Logic: Try Groq. If fails (timeout, rate limit, error), instantly try Ollama.
 */
export async function generateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: LLMOptions = {},
  signal?: AbortSignal
): Promise<LLMResult> {
  const maxTokens = options.maxTokens ?? 450; // Increased from 250
  const temperature = options.temperature ?? 0.8; // Increased from 0.7 for more natural flow

  // ── Step 1: Try Groq ──
  try {
    logger.info("🚀 LLM: attempting Groq", { model: GROQ_MODEL });

    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "user", content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: temperature,
      stream: true,
    }, {
      signal: signal,
      timeout: GROQ_TIMEOUT_MS
    });

    let fullText = "";
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullText += content;
        onChunk(content);
      }
    }

    logger.info("✅ LLM: Groq succeeded");
    return { fullText, modelUsed: "groq", fallbackUsed: false };

  } catch (error) {
    logger.warn("⚠️ LLM: Groq failed, falling back to Ollama", {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // ── Step 2: Fallback to Ollama ──
  try {
    logger.info("🔄 LLM: attempting Ollama fallback");
    const fullText = await ollamaGenerateStream(
      prompt,
      onChunk,
      {
        num_predict: maxTokens,
        temperature: temperature,
      },
      signal
    );

    logger.info("✅ LLM: Ollama fallback succeeded");
    return { fullText, modelUsed: "ollama", fallbackUsed: true };

  } catch (error) {
    logger.error("🔴 LLM: both Groq and Ollama failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    
    const failMsg = "I'm having a bit of trouble connecting right now. Please try again in a moment.";
    onChunk(failMsg);
    return { fullText: failMsg, modelUsed: "ollama", fallbackUsed: true };
  }
}

// ── Non-Streaming Generation ───────────────────────────────────
/**
 * Used for background tasks (summarization, titles).
 */
export async function generate(
  prompt: string,
  options: LLMOptions = {}
): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: options.maxTokens ?? 450,
      temperature: options.temperature ?? 0.8,
    }, {
      timeout: GROQ_TIMEOUT_MS
    });

    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    logger.warn("LLM (non-stream): Groq failed, using Ollama", {
      error: error instanceof Error ? error.message : String(error)
    });
    return ollamaGenerate(prompt, {
      num_predict: options.maxTokens ?? 300,
      temperature: options.temperature ?? 0.5,
    });
  }
}
