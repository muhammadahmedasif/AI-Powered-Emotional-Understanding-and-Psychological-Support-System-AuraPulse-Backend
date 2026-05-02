import { logger } from "../utils/logger";

// ── Configuration ──────────────────────────────────────────────
const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const MODEL = process.env.OLLAMA_MODEL || "llama3";
const TIMEOUT_MS = 300_000; // 5 minutes — local model queues concurrent requests so it needs a longer timeout

// ── Types ──────────────────────────────────────────────────────
interface OllamaChunk {
  response?: string;
  done?: boolean;
  error?: string;
}

export interface OllamaOptions {
  num_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
}

// ── Streaming Generation ───────────────────────────────────────
/**
 * Generates a streamed response from local Ollama.
 * Includes a proper NDJSON line buffer to handle chunks
 * that are split across TCP packet boundaries.
 */
export async function ollamaGenerateStream(
  prompt: string,
  onChunk: (text: string) => void,
  options: OllamaOptions = {},
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  try {
    logger.info("📤 Ollama: sending streaming request", { model: MODEL });

    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: true,
        options,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Ollama response body is empty");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    let lineBuffer = ""; // ← KEY FIX: retains incomplete lines across chunks

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Append raw bytes to the line buffer
      lineBuffer += decoder.decode(value, { stream: true });

      // Split on newlines — the LAST element may be incomplete
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() || ""; // keep incomplete tail in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const data = JSON.parse(trimmed) as OllamaChunk;
          if (data.response) {
            fullText += data.response;
            onChunk(data.response);
          }
        } catch {
          // Truly malformed line — log and skip
          logger.warn("Ollama: skipping unparseable line", {
            line: trimmed.slice(0, 80),
          });
        }
      }
    }

    // Process any remaining data in the buffer
    if (lineBuffer.trim()) {
      try {
        const data = JSON.parse(lineBuffer.trim()) as OllamaChunk;
        if (data.response) {
          fullText += data.response;
          onChunk(data.response);
        }
      } catch {
        // Final incomplete chunk — acceptable to drop
      }
    }

    logger.info("✅ Ollama: stream completed", {
      responseLength: fullText.length,
    });
    return fullText;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Ollama request timed out");
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("🔴 Ollama: stream error", { error: errMsg });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Non-Streaming Generation ───────────────────────────────────
/**
 * Generates a complete (non-streamed) response from Ollama.
 * Used for background tasks: summarization, title generation.
 */
export async function ollamaGenerate(
  prompt: string,
  options: OllamaOptions = {}
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    logger.info("📤 Ollama: sending non-streaming request", { model: MODEL });

    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options,
      }),
      signal: controller.signal,
    });

    const text = await response.text();

    let data: OllamaChunk;
    try {
      data = JSON.parse(text) as OllamaChunk;
    } catch {
      throw new Error(`Invalid JSON from Ollama: ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      throw new Error(
        data.error || `Ollama failed with status ${response.status}`
      );
    }

    if (!data.response) {
      throw new Error("Ollama response did not include generated text");
    }

    logger.info("✅ Ollama: response received");
    return data.response.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Ollama non-streaming request timed out");
    }
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("🔴 Ollama: error", { error: errMsg });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
