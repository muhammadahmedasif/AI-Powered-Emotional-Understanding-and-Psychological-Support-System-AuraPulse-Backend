import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import { logger } from "./logger";

// Standard model to use across the project - Confirmed working for 2026 free tier
export const DEFAULT_MODEL = "gemini-2.5-flash";

// Common generation config for JSON response
export const jsonGenerationConfig: GenerationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 2048,
  responseMimeType: "application/json",
};

// -----------------------------------------------------------------------
// API Key Rotation Pool & Smart Backoff
// -----------------------------------------------------------------------

interface ExhaustionState {
  type: "429" | "503" | "404" | "misc";
  at: number;
}

let currentKeyIndex = 0;
const exhaustedKeys: Map<number, ExhaustionState> = new Map();
let globalCircuitBreakerUntil: number = 0;

const COOLDOWN_429 = 5 * 60 * 1000; // 5 minutes for quota
const COOLDOWN_503 = 30 * 1000;    // 30 seconds for high demand
const COOLDOWN_404 = 60 * 60 * 1000; // 1 hour for errors that suggest key/model mismatch
const GLOBAL_COOLDOWN = 60 * 1000;  // 1 minute if everything is dead

const getApiKeys = (): string[] => {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) keys.push(process.env.GEMINI_API_KEY_4);
  return keys;
};

const getNextAvailableKey = (): string | null => {
  const keys = getApiKeys();
  if (keys.length === 0) return null;

  const now = Date.now();

  // Check global circuit breaker
  if (now < globalCircuitBreakerUntil) {
    return null;
  }

  // Reset exhausted keys whose cooldown has passed
  for (const [idx, state] of exhaustedKeys.entries()) {
    const cooldown = state.type === "429" ? COOLDOWN_429 : 
                     state.type === "503" ? COOLDOWN_503 : COOLDOWN_404;
    if (now - state.at > cooldown) {
      exhaustedKeys.delete(idx);
      logger.info(`Gemini API key #${idx + 1} (${state.type}) available again.`);
    }
  }

  // Find next available
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length;
    if (!exhaustedKeys.has(idx)) {
      currentKeyIndex = idx;
      return keys[idx];
    }
  }

  // If we reach here, all keys are exhausted. Activate circuit breaker.
  logger.warn("All Gemini API keys exhausted. Activating temporary circuit breaker.");
  globalCircuitBreakerUntil = now + GLOBAL_COOLDOWN;
  return null;
};

const markKeyExhausted = (error: any) => {
  const keys = getApiKeys();
  const type: ExhaustionState["type"] = 
    error?.status === 429 || error?.message?.includes("429") ? "429" :
    error?.status === 503 || error?.message?.includes("503") ? "503" :
    error?.status === 404 || error?.message?.includes("404") ? "404" : "misc";

  logger.warn(`Gemini API key #${currentKeyIndex + 1} marked [${type}] due to error. Rotating...`);
  exhaustedKeys.set(currentKeyIndex, { type, at: Date.now() });
  currentKeyIndex = (currentKeyIndex + 1) % Math.max(keys.length, 1);
};

export const getModel = (modelName: string = DEFAULT_MODEL, config?: GenerationConfig) => {
  const apiKey = getNextAvailableKey();
  if (!apiKey) {
    throw new Error("High demand: All AI service instances are currently busy. Please try again in 1 minute.");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName, generationConfig: config });
};

const isRetriableError = (error: any): boolean => {
  return error?.status === 429 || error?.status === 503 || 
         error?.message?.includes("429") || error?.message?.includes("503") ||
         error?.message?.includes("quota") || error?.message?.includes("demand");
};

async function generateContentWithRotation(
  modelName: string,
  prompt: string,
  config?: GenerationConfig
): Promise<string> {
  const keys = getApiKeys();
  let lastError: any;

  for (let attempt = 0; attempt < Math.max(keys.length, 1); attempt++) {
    try {
      const model = getModel(modelName, config);
      const result = await model.generateContent(prompt);
      return result.response.text().trim();
    } catch (error: any) {
      lastError = error;
      if (isRetriableError(error)) {
        markKeyExhausted(error);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function generateJSONContent<T>(
  prompt: string,
  fallbackValue: T,
  modelName: string = DEFAULT_MODEL
): Promise<T> {
  try {
    const text = await generateContentWithRotation(modelName, prompt, jsonGenerationConfig);
    return JSON.parse(text) as T;
  } catch (error: any) {
    logger.error("AI JSON generation failed:", { message: error.message });
    return fallbackValue;
  }
}

export async function generateTextContent(
  prompt: string,
  fallbackValue: string,
  modelName: string = DEFAULT_MODEL
): Promise<string> {
  try {
    return await generateContentWithRotation(modelName, prompt);
  } catch (error: any) {
    logger.error("AI text generation failed:", { message: error.message });
    return fallbackValue;
  }
}
