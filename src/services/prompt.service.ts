import { logger } from "../utils/logger";
import { generateResponseStream, OllamaOptions } from "./ai";
import { Intent, MessageAnalysis } from "../types";

const MAX_PROMPT_CHARS = 2500;

// STATIC System Layer (Cached)
const SYSTEM_PROMPT = `You are a helpful, calm, and intelligent AI assistant with a natural conversational personality.

You can handle both technical tasks and emotional conversations, but you must always respond in a natural, human-like way.

---

# CORE PERSONALITY

* Calm, friendly, and conversational
* Slightly talkative but not verbose
* Avoid repetitive phrases like:

  * "I'm glad to hear that"
  * "It's wonderful to hear"
* Do not sound like a therapist or scripted assistant
* Speak naturally like a thoughtful, intelligent friend, supportive and calm, caring and empathetic, yet also a bit witty and humorous when appropriate.

---

# BEHAVIOR MODES (implicit, not rigid)

## 1. Task Handling Mode (default)

Use this when the user asks for:

* coding
* explanations
* problem solving
* building things
* factual or technical questions

Behavior:

* Be direct and efficient
* Solve the task immediately
* Do NOT add emotional commentary unless relevant
* Keep explanations clear but conversational

---

## 2. Supportive Mode (only when needed)

Use only when the user expresses:

* sadness
* stress
* anxiety
* frustration
* personal emotional struggles

Behavior:

* Be calm, warm, and supportive
* Do NOT be overly dramatic or repetitive
* Avoid therapy-style phrasing
* Focus on grounding and clarity, not emotional exaggeration

---

# STRICT RULES

* Do NOT repeat generic empathetic phrases
* Do NOT start every response with greetings or emotional validation
* Do NOT force emotional interpretation on technical requests
* Do NOT switch modes unnecessarily
* Always respect the user’s intent first

---

# STYLE GUIDELINES

* Use natural flow like real conversation
* Vary sentence structure
* Avoid robotic patterns
* Be engaging but not overly enthusiastic
* Keep responses smooth and human-like

---

# GOAL

You are not a therapist and not just a coding assistant.

You are a:
balanced, intelligent conversational AI that can both help with tasks and respond naturally to human emotion when needed.
`;

export function detectIntent(message: string): Intent {
  const text = message.toLowerCase();

  // Task signals (highest priority)
  const taskRegex =
    /write|code|cpp|c\+\+|python|javascript|implement|build|create|function|fix|debug|explain|solve/i;

  // Emotional signals
  const supportRegex =
    /sad|depressed|anxious|stress|lonely|hurt|worthless|tired|bad|upset|cry/i;

  if (taskRegex.test(text)) return "task";
  if (supportRegex.test(text)) return "support";

  return "general";
}

export function buildRecentContext(
  messages: Array<{ role: string; content: string }>,
  maxChars = MAX_PROMPT_CHARS
): string {
  let usedChars = 0;
  const context: string[] = [];

  for (const message of [...messages].reverse()) {
    const roleStr = message.role === "user" ? "User" : "Maya";
    const line = `${roleStr}: ${message.content}`;

    if (usedChars + line.length > maxChars) {
      break;
    }

    context.unshift(line);
    usedChars += line.length;
  }

  return context.join("\n");
}


const defaultAnalysis: MessageAnalysis = {
  emotionalState: "neutral",
  themes: [],
  riskLevel: 0,
  recommendedApproach: "supportive",
  progressIndicators: [],
};

export async function generateAIResponseStream(
  message: string,
  history: string,
  summary: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<{ reply: string; analysis: MessageAnalysis }> {
  // Clean Prompt Pipeline
  let prompt = `${SYSTEM_PROMPT}\n\n`;
  let memorySource = "none";

  // Memory Layer (DYNAMIC) - Use ONLY ONE
  if (summary) {
    prompt += `Summary: ${summary}\n\n`;
    memorySource = "summary";
  } else if (history) {
    prompt += `Recent:\n${history}\n\n`;
    memorySource = "history";
  }

  // User Input Layer
  prompt += `User: ${message}\nMaya:`;

  // Hard Context Budget Enforcement
  if (prompt.length > MAX_PROMPT_CHARS) {
    const excess = prompt.length - MAX_PROMPT_CHARS;
    prompt =
      prompt.slice(0, SYSTEM_PROMPT.length + 5) +
      "\n...\n" +
      prompt.slice(SYSTEM_PROMPT.length + 5 + excess + 5);
  }

  // Verification Logging
  const estimatedTokens = Math.ceil(prompt.length / 4);
  logger.info("Prompt metrics", {
    promptLengthChars: prompt.length,
    estimatedTokens,
    memorySource,
    systemPromptCount: (prompt.match(/You are Maya/g) || []).length,
  });

  const isSimpleGreeting =
    /^(hi|hello|hey|how are you|good morning|good evening)\b/i.test(
      message.trim()
    );
  const maxTokens = isSimpleGreeting ? 60 : 120;

  try {
    const reply = await generateResponseStream(
      prompt,
      onChunk,
      { num_predict: maxTokens, temperature: 0.6 },
      signal
    );
    return { reply: reply.trim(), analysis: defaultAnalysis };
  } catch (error) {
    logger.error("AI streaming response failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
