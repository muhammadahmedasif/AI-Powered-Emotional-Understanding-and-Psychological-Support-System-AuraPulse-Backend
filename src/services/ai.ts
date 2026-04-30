const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const MODEL = process.env.OLLAMA_MODEL || "llama3";
const TIMEOUT_MS = 240_000;

interface OllamaResponse {
  response?: string;
  error?: string;
}

export interface OllamaOptions {
  num_predict?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop?: string[];
  seed?: number;
}

export async function generateResponse(
  prompt: string, 
  options?: OllamaOptions,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  try {
    console.log(`📤 Sending request to Ollama at ${OLLAMA_URL} with model: ${MODEL}`);
    
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options,
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    
    let data: OllamaResponse;
    try {
      data = JSON.parse(text) as OllamaResponse;
    } catch (parseError) {
      throw new Error(
        `Invalid JSON from Ollama: ${text.slice(0, 200)}`
      );
    }

    if (!response.ok) {
      throw new Error(data.error || `Ollama failed with status ${response.status}`);
    }

    if (!data.response) {
      throw new Error("Ollama response did not include generated text");
    }

    console.log("✅ Ollama response received successfully");
    return data.response.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("🕐 Ollama request timed out - model might be overloaded or unresponsive");
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    
    console.error("🔴 OLLAMA ERROR:", {
      url: OLLAMA_URL,
      model: MODEL,
      error: errorMsg,
      status: error instanceof Error ? error.name : "unknown",
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateResponseStream(
  prompt: string,
  onChunk: (chunk: string) => void,
  options?: OllamaOptions,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  try {
    console.log(`📤 Sending streaming request to Ollama at ${OLLAMA_URL} with model: ${MODEL}`);
    
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(Boolean);
      
      for (const line of lines) {
        try {
          const data = JSON.parse(line) as OllamaResponse;
          if (data.response) {
            fullText += data.response;
            onChunk(data.response);
          }
        } catch (parseError) {
          // Ignore incomplete JSON chunks from split lines
        }
      }
    }

    console.log("✅ Ollama stream completed successfully");
    return fullText;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("🕐 Ollama request timed out");
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("🔴 OLLAMA STREAM ERROR:", { error: errorMsg });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

