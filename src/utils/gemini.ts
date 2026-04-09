import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import { logger } from "./logger";

// Standard model to use across the project
const DEFAULT_MODEL = "gemini-2.0-flash";

// Common generation config for JSON response
export const jsonGenerationConfig: GenerationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 2048,
  responseMimeType: "application/json",
};

// -----------------------------------------------------------------------
// API Key Rotation Pool
// Reads all available keys at call-time (after dotenv has loaded).
// Add GEMINI_API_KEY_2, GEMINI_API_KEY_3, etc. to your .env to enable.
// -----------------------------------------------------------------------

let currentKeyIndex = 0;
// Track which keys are exhausted and when they were marked (resets after 60s)
const exhaustedKeys: Map<number, number> = new Map();

const getApiKeys = (): string[] => {
  const keys: string[] = [];
  // Always load in order: GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3 ...
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEY_2) keys.push(process.env.GEMINI_API_KEY_2);
  if (process.env.GEMINI_API_KEY_3) keys.push(process.env.GEMINI_API_KEY_3);
  if (process.env.GEMINI_API_KEY_4) keys.push(process.env.GEMINI_API_KEY_4);
  return keys;
};

const getNextAvailableKey = (): string | null => {
  const keys = getApiKeys();
  if (keys.length === 0) {
    logger.error("No Gemini API keys configured in environment variables.");
    return null;
  }

  const now = Date.now();
  const COOLDOWN_MS = 300_000; // Re-try an exhausted key after 5 minutes

  // Reset exhausted keys whose cooldown has passed
  for (const [idx, exhaustedAt] of exhaustedKeys.entries()) {
    if (now - exhaustedAt > COOLDOWN_MS) {
      exhaustedKeys.delete(idx);
      logger.info(`Gemini API key #${idx + 1} cooldown reset, available again.`);
    }
  }

  // Try to find an available key starting from currentKeyIndex
  for (let i = 0; i < keys.length; i++) {
    const idx = (currentKeyIndex + i) % keys.length;
    if (!exhaustedKeys.has(idx)) {
      currentKeyIndex = idx;
      return keys[idx];
    }
  }

  logger.warn("All Gemini API keys are currently exhausted (quota limit). Will retry on next request.");
  return null;
};

const markKeyExhausted = () => {
  const keys = getApiKeys();
  logger.warn(
    `Gemini API key #${currentKeyIndex + 1} is quota-exceeded. Rotating to next key... (${keys.length} total keys)`
  );
  exhaustedKeys.set(currentKeyIndex, Date.now());
  // Advance to next key for the next call
  currentKeyIndex = (currentKeyIndex + 1) % Math.max(keys.length, 1);
};

/**
 * Get a generative model instance using the next available API key.
 */
export const getModel = (modelName: string = DEFAULT_MODEL, config?: GenerationConfig) => {
  const apiKey = getNextAvailableKey();
  if (!apiKey) {
    throw new Error("All Gemini API keys are exhausted. Please try again later.");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: modelName, generationConfig: config });
};

/**
 * Check if an error is a 429 quota/rate-limit error.
 */
const isQuotaError = (error: any): boolean => {
  const isQuota = (
    error?.status === 429 ||
    error?.message?.includes("429") ||
    error?.message?.includes("quota") ||
    error?.message?.includes("Too Many Requests")
  );
  if (isQuota) {
    logger.warn(`Quota error detected: ${error?.message || JSON.stringify(error)}`);
  }
  return isQuota;
};

/**
 * Generate content with automatic key rotation on quota errors.
 * Tries all available keys before giving up.
 */
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
      if (isQuotaError(error)) {
        markKeyExhausted();
        // Try next key
        continue;
      }
      // Non-quota error — don't retry
      throw error;
    }
  }

  throw lastError;
}

/**
 * Generate and parse a JSON response, with key rotation + fallback.
 */
export async function generateJSONContent<T>(
  modelName: string,
  prompt: string,
  fallbackValue: T
): Promise<T> {
  try {
    const text = await generateContentWithRotation(modelName, prompt, jsonGenerationConfig);
    try {
      return JSON.parse(text) as T;
    } catch (parseError) {
      logger.error("Failed to parse AI JSON response:", { text, parseError });
      return fallbackValue;
    }
  } catch (error: any) {
    if (isQuotaError(error)) {
      logger.warn("All Gemini API keys exhausted for JSON generation, using fallback.");
    } else {
      logger.error("Error in AI JSON generation:", { 
        message: error instanceof Error ? error.message : "No message",
        error: error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
    return fallbackValue;
  }
}

/**
 * Generate plain text content, with key rotation + fallback string.
 */
export async function generateTextContent(
  modelName: string,
  prompt: string,
  fallbackValue: string
): Promise<string> {
  try {
    return await generateContentWithRotation(modelName, prompt);
  } catch (error: any) {
    if (isQuotaError(error)) {
      logger.warn("All Gemini API keys exhausted for text generation, using fallback.");
    } else {
      logger.error("Error in AI text generation:", { 
        message: error instanceof Error ? error.message : "No message",
        error: error,
        stack: error instanceof Error ? error.stack : undefined
      });
    }
    return fallbackValue;
  }
}
