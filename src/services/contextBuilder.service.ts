/**
 * Context Builder Service
 * ───────────────────────
 * Assembles the final prompt sent to the LLM.
 * Implements HYBRID memory: always includes BOTH
 * the summary AND recent messages.
 */

import { getRecentMessages, formatMessagesForPrompt, SimpleMessage } from "./memory.service";

// ── Behavior Mapping (The precise personality descriptions) ────────
const BEHAVIOR_MAP = {
  supportive: "empathetic, warm, and understanding",
  friendly: "casual, light-hearted, and conversational",
  motivational: "encouraging, energetic, and uplifting",
  calm: "slow, grounding, and therapist-like"
};

// ── Build Base System Prompt ────────────────────────────────────
function getBaseSystemPrompt(aiName: string = "Maya", aiBehavior: string = "supportive"): string {
  const behaviorDescription = BEHAVIOR_MAP[aiBehavior as keyof typeof BEHAVIOR_MAP] || BEHAVIOR_MAP.supportive;
  
  return `You are ${aiName}, a ${behaviorDescription} AI companion helping users manage emotions and mental well-being.

You are not a medical professional, but you speak like a caring friend.
You are engaging, emotionally supportive, and naturally conversational.

Respond in a natural conversational tone. Keep responses moderately detailed (3–6 sentences).
Avoid being too short or overly long. Provide slight explanation or reflection when appropriate, but stay concise and supportive.

When the user expresses emotion (stress, anxiety, sadness), respond with:
- A warm acknowledgment
- A brief reflection of their feeling
- One small supportive suggestion or a gentle question

You NEVER explicitly label emotions (e.g., never say "You are stressed" or "I detect panic").
Instead, you validate feelings gracefully (e.g., "That sounds like a lot to carry").

Avoid long paragraphs and clinical language.
Make the user feel heard, relaxed, and supported.`;
}

// ── Max Context Budget ─────────────────────────────────────────
const MAX_CONTEXT_CHARS = 3000;

// ── Build Full Prompt ──────────────────────────────────────────
/**
 * Assembles the complete prompt with hybrid memory:
 *
 * 1. System Prompt (Maya personality)
 * 2. Long-term Memory (summary — if exists)
 * 3. Short-term Memory (recent messages — ALWAYS included)
 * 4. Current User Message
 *
 * CRITICAL: Never replaces recent messages with summary.
 *           Both are ALWAYS included together.
 */
export function buildPrompt(
  userMessage: string,
  allMessages: SimpleMessage[],
  summary: string,
  userName?: string,
  latestMood?: "low" | "neutral" | "positive" | "unknown",
  aiName: string = "Maya",
  aiBehavior: string = "supportive"
): string {
  const parts: string[] = [];

  // ── Layer 1: System Prompt & Mood Awareness ──
  let systemPrompt = getBaseSystemPrompt(aiName, aiBehavior);
  if (userName) {
    systemPrompt += `\n\nThe user's name is ${userName}.`;
  }
  
  if (latestMood && latestMood !== "unknown") {
    systemPrompt += `\n\nThe user's last tracked mood was ${latestMood}.`;
    if (allMessages.length <= 1) { // 0 or 1 messages means start of chat
      systemPrompt += `\nSince this is the beginning of the conversation, warmly and gently acknowledge this mood and ask how they are feeling today. If they were feeling low, make sure to console them first.`;
    }
  }

  parts.push(systemPrompt);

  // ── Layer 2: Long-term Memory (Summary) ──
  if (summary && summary.trim()) {
    parts.push(`[Conversation Summary]\n${summary.trim()}`);
  }

  // ── Layer 3: Short-term Memory (Recent Messages) ──
  const recent = getRecentMessages(allMessages);
  if (recent.length > 0) {
    const formatted = formatMessagesForPrompt(recent, aiName);
    parts.push(`[Recent Conversation]\n${formatted}`);
  }

  // ── Layer 4: Current User Message ──
  parts.push(`User: ${userMessage}\n${aiName}:`);

  // ── Assemble ──
  let prompt = parts.join("\n\n");

  // ── Budget Enforcement ──
  // If the prompt exceeds the budget, trim from the MIDDLE (summary area),
  // never the system prompt or the user message.
  if (prompt.length > MAX_CONTEXT_CHARS) {
    // Rebuild with a shorter recent context
    const shorterRecent = getRecentMessages(allMessages, 6);
    const formatted = formatMessagesForPrompt(shorterRecent, aiName);

    const rebuiltParts: string[] = [systemPrompt];
    // Include summary only if there's room
    if (summary && summary.trim()) {
      rebuiltParts.push(`[Summary]\n${summary.trim().slice(0, 300)}`);
    }
    rebuiltParts.push(`[Recent]\n${formatted}`);
    rebuiltParts.push(`User: ${userMessage}\n${aiName}:`);
    prompt = rebuiltParts.join("\n\n");
  }

  return prompt;
}

/**
 * Returns the system prompt constant for external use (e.g. logging).
 */
export function getSystemPrompt(aiName: string = "Maya", aiBehavior: string = "supportive"): string {
  return getBaseSystemPrompt(aiName, aiBehavior);
}
