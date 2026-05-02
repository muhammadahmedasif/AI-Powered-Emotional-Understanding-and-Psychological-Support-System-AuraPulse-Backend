/**
 * Context Builder Service
 * ───────────────────────
 * Assembles the final prompt sent to the LLM.
 * Implements HYBRID memory: always includes BOTH
 * the summary AND recent messages.
 */

import { getRecentMessages, formatMessagesForPrompt, SimpleMessage } from "./memory.service";

// ── Maya System Prompt (constant, reused every request) ────────
const SYSTEM_PROMPT = `You are Maya, a calm, friendly, and emotionally supportive AI companion.

You are not a medical professional.

You speak in a warm, natural, and human-like tone. You are engaging and gently conversational, not robotic.

You care about the user's emotional well-being. You listen, validate feelings, and offer simple supportive guidance.

You sometimes ask thoughtful follow-up questions to keep the conversation flowing.

You keep responses concise but meaningful.

You may use the user's name naturally when appropriate.

Avoid long paragraphs. Avoid sounding clinical.

Your goal is to make the user feel heard, relaxed, and supported.`;

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
  userName?: string
): string {
  const parts: string[] = [];

  // ── Layer 1: System Prompt ──
  let systemPrompt = SYSTEM_PROMPT;
  if (userName) {
    systemPrompt += `\n\nThe user's name is ${userName}.`;
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
