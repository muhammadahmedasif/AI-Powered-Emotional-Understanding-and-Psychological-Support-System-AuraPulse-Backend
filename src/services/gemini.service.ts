import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger";

// ── Configuration ──────────────────────────────────────────────
const MODEL = "gemini-2.0-flash-lite";
const TIMEOUT_MS = 15_000;

// ── SDK — initialized once ─────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Types ──────────────────────────────────────────────────────
export interface GeminiOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

// ── Error Classes ──────────────────────────────────────────────
export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

export class GeminiQuotaError extends GeminiError {
  constructor(message: string) {
    super(message);
    this.name = "GeminiQuotaError";
  }
}

export class GeminiTimeoutError extends GeminiError {
  constructor(message: string) {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

// ── Error Classification ───────────────────────────────────────
function classifyAndThrow(error: unknown): never {
  const msg = error instanceof Error ? error.message : String(error);

  if (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota") ||
    msg.includes("rate limit")
  ) {
    throw new GeminiQuotaError(msg);
  }

  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    msg.includes("timed out")
  ) {
    throw new GeminiTimeoutError(msg);
  }

  throw new GeminiError(msg);
}

// ── Streaming Generation ───────────────────────────────────────
/**
 * Streams a response from gemini-2.0-flash-lite.
 * Calls onChunk with each text fragment as it arrives.
 * Returns the full assembled text.
 */
export async function geminiGenerateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: GeminiOptions = {},
  signal?: AbortSignal
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 250,
      temperature: options.temperature ?? 0.7,
      topP: options.topP ?? 0.9,
      topK: options.topK ?? 40,
    },
  });

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), TIMEOUT_MS);
  if (signal) {
    signal.addEventListener("abort", () => timeoutController.abort());
  }

  try {
    logger.info("📤 Gemini: sending request", { model: MODEL });

    const result = await model.generateContentStream(prompt);
    let fullText = "";

    for await (const chunk of result.stream) {
      if (timeoutController.signal.aborted) {
        throw new DOMException("Gemini request timed out", "AbortError");
      }

      const text = chunk.text();
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }

    clearTimeout(timeout);
    logger.info("✅ Gemini: response complete", {
      model: MODEL,
      length: fullText.length,
    });
    return fullText;
  } catch (error) {
    clearTimeout(timeout);
    logger.error("🔴 Gemini: failed", {
      model: MODEL,
      error: error instanceof Error ? error.message : String(error),
    });
    classifyAndThrow(error);
  }
}

// ── Non-Streaming Generation ───────────────────────────────────
/**
 * Returns a complete response from gemini-2.0-flash-lite.
 * Used for background tasks when streaming is not needed.
 */
export async function geminiGenerate(
  prompt: string,
  options: GeminiOptions = {}
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens ?? 250,
      temperature: options.temperature ?? 0.5,
    },
  });

  try {
    logger.info("📤 Gemini (non-stream): sending request", { model: MODEL });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    logger.info("✅ Gemini (non-stream): response complete", {
      model: MODEL,
      length: text.length,
    });
    return text;
  } catch (error) {
    logger.error("🔴 Gemini (non-stream): failed", {
      model: MODEL,
      error: error instanceof Error ? error.message : String(error),
    });
    classifyAndThrow(error);
  }
}
