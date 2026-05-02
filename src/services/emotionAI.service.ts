import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { logger } from "../utils/logger";
import { ollamaGenerate } from "./ollama.service";

// Initialize Gemini SDK once
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const MODEL_NAME = "gemini-2.0-flash-lite";

// ── Types ──────────────────────────────────────────────────────
export interface EmotionAIParams {
  userMessage: string;
  recentMessages: string;
  sessionSummary: string;
  latestMood: "low" | "neutral" | "positive" | "unknown";
}

export interface EmotionAIResult {
  emotion: "panic" | "stress" | "low" | "neutral" | "positive";
  intensity: number;
  suggestedActivity: "breathing" | "ocean" | "forest" | "zen" | null;
  autoTrigger: boolean;
}

// ── Fallback Heuristic ─────────────────────────────────────────
function fallbackAnalysis(message: string, latestMood: string): EmotionAIResult {
  const lowercaseMsg = message.toLowerCase();
  
  if (lowercaseMsg.includes("panic")) {
    return { emotion: "panic", intensity: 0.9, suggestedActivity: "breathing", autoTrigger: true };
  }
  if (lowercaseMsg.includes("stress")) {
    return { emotion: "stress", intensity: 0.8, suggestedActivity: "ocean", autoTrigger: true };
  }
  if (lowercaseMsg.includes("anxious") || lowercaseMsg.includes("anxiety")) {
    return { emotion: "stress", intensity: 0.7, suggestedActivity: "breathing", autoTrigger: false };
  }
  if (lowercaseMsg.includes("overwhelm")) {
    return { emotion: "stress", intensity: 0.75, suggestedActivity: "zen", autoTrigger: false };
  }
  if (lowercaseMsg.includes("sad") || lowercaseMsg.includes("depress")) {
    return { emotion: "low", intensity: 0.7, suggestedActivity: "forest", autoTrigger: latestMood === "low" };
  }

  return { emotion: "neutral", intensity: 0.1, suggestedActivity: null, autoTrigger: false };
}

// ── Main Analysis Function ─────────────────────────────────────
export async function analyzeUserState(params: EmotionAIParams): Promise<EmotionAIResult> {
  const systemPrompt = `You are an emotion analysis engine.
Analyze emotional state based on context.
Return ONLY valid JSON with this exact structure:
{"emotion":"panic|stress|low|neutral|positive","intensity":0.0-1.0,"suggestedActivity":"breathing|ocean|forest|zen|null","autoTrigger":true|false}

DECISION RULES:
panic -> breathing
stress -> ocean OR breathing
low -> forest OR zen
neutral/positive -> null

AUTO TRIGGER RULES:
autoTrigger = true IF:
- intensity > 0.7
- OR latestMood = low / very_low`;

  const userPrompt = `User message: "${params.userMessage}"
Recent context: "${params.recentMessages}"
Summary: "${params.sessionSummary}"
Mood: "${params.latestMood}"`;

  const prompt = systemPrompt + "\n\n" + userPrompt;

  try {
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.2, // Low temperature for stable classification
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            emotion: {
              type: SchemaType.STRING,
              description: "The primary emotional state of the user. Must be one of: panic, stress, low, neutral, positive."
            },
            intensity: {
              type: SchemaType.NUMBER,
              description: "Intensity of the emotion on a scale of 0.0 to 1.0."
            },
            suggestedActivity: {
              type: SchemaType.STRING,
              description: "Suggested activity. Must be one of: breathing, ocean, forest, zen, null. Return 'null' string if neutral or positive."
            },
            autoTrigger: {
              type: SchemaType.BOOLEAN,
              description: "True if intensity > 0.7 OR latestMood is low."
            }
          },
          required: ["emotion", "intensity", "suggestedActivity", "autoTrigger"]
        }
      },
    });

    logger.info("🧠 emotionAI: Running analysis...");
    
    // Set a very tight timeout for the non-critical background task
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), 3000);

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    
    clearTimeout(timeout);

    const text = result.response.text();
    const data = JSON.parse(text);

    const finalResult: EmotionAIResult = {
      emotion: data.emotion,
      intensity: data.intensity,
      suggestedActivity: data.suggestedActivity === "null" ? null : data.suggestedActivity,
      autoTrigger: data.autoTrigger
    };

    logger.info("✅ emotionAI: Gemini Complete", finalResult);
    return finalResult;
    
  } catch (error) {
    logger.warn("⚠️ emotionAI: Gemini failed, attempting Ollama fallback", { 
      error: error instanceof Error ? error.message : String(error) 
    });

    try {
      // Use a strict 3-second timeout for the Ollama fallback too
      const ollamaText = await Promise.race([
        ollamaGenerate(prompt, { temperature: 0.1 }),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error("Ollama timeout")), 3000)
        )
      ]);

      // Extract JSON in case Ollama wraps it in markdown blocks
      const jsonMatch = ollamaText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Ollama response");

      const data = JSON.parse(jsonMatch[0]);
      
      const finalResult: EmotionAIResult = {
        emotion: data.emotion,
        intensity: data.intensity,
        suggestedActivity: data.suggestedActivity === "null" ? null : data.suggestedActivity,
        autoTrigger: data.autoTrigger
      };

      logger.info("✅ emotionAI: Ollama Fallback Complete", finalResult);
      return finalResult;
    } catch (ollamaError) {
      logger.error("🔴 emotionAI: Ollama fallback failed, using heuristic", {
        error: ollamaError instanceof Error ? ollamaError.message : String(ollamaError)
      });
      return fallbackAnalysis(params.userMessage, params.latestMood);
    }
  }
}
