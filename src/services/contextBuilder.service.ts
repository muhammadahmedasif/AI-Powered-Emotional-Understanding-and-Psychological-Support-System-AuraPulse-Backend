/**
 * Context Builder Service
 * ───────────────────────
 * Assembles the final prompt sent to the LLM.
 * Implements HYBRID memory: always includes BOTH
 * the summary AND recent messages.
 */

import { getRecentMessages, formatMessagesForPrompt, SimpleMessage } from "./memory.service";

// ── Maya System Prompt (constant, reused every request) ────────
const SYSTEM_PROMPT = `You are Maya, a warm, calm, and friendly AI companion.

You are not a medical professional, but you speak like a caring friend.
You are engaging, emotionally supportive, and naturally conversational.

You gently check in, notice emotional shifts, and respond naturally—never mechanically.
You NEVER explicitly label emotions (e.g., never say "You are stressed" or "I detect panic").
Instead, you validate feelings gracefully (e.g., "That sounds like a lot to carry").

Keep responses concise (2-4 lines max).
Avoid long paragraphs and clinical language.

If the user is struggling, validate their feelings first, suggest small actions gently, and keep the tone flowing.
Make the user feel heard, relaxed, and supported.`;

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
  latestMood?: "low" | "neutral" | "positive" | "unknown"
): string {
  const parts: string[] = [];

  // ── Layer 1: System Prompt & Mood Awareness ──
  let systemPrompt = SYSTEM_PROMPT;
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
    const formatted = formatMessagesForPrompt(recent);
    parts.push(`[Recent Conversation]\n${formatted}`);
  }

  // ── Layer 4: Current User Message ──
  parts.push(`User: ${userMessage}\nMaya:`);

  // ── Assemble ──
  let prompt = parts.join("\n\n");

  // ── Budget Enforcement ──
  // If the prompt exceeds the budget, trim from the MIDDLE (summary area),
  // never the system prompt or the user message.
  if (prompt.length > MAX_CONTEXT_CHARS) {
    // Rebuild with a shorter recent context
    const shorterRecent = getRecentMessages(allMessages, 6);
    const formatted = formatMessagesForPrompt(shorterRecent);

    const rebuiltParts: string[] = [systemPrompt];
    // Include summary only if there's room
    if (summary && summary.trim()) {
      rebuiltParts.push(`[Summary]\n${summary.trim().slice(0, 300)}`);
    }
    rebuiltParts.push(`[Recent]\n${formatted}`);
    rebuiltParts.push(`User: ${userMessage}\nMaya:`);
    prompt = rebuiltParts.join("\n\n");
  }

  return prompt;
}

/**
 * Returns the system prompt constant for external use (e.g. logging).
 */
export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
