/**
 * Summarizer Service
 * ──────────────────
 * Generates and updates conversation summaries.
 * Uses OLLAMA ONLY (never Gemini) to preserve free-tier quota.
 * Fixes the old bugs:
 *   - Uses last 20 MESSAGES (not 20 characters)
 *   - Uses atomic $set update (not full document .save())
 */

import { logger } from "../utils/logger";
import { ChatSession } from "../models/ChatSession";
import { ollamaGenerate } from "./ollama.service";
import { formatMessagesForPrompt, SimpleMessage } from "./memory.service";

// ── Configuration ──────────────────────────────────────────────
const SUMMARY_INTERVAL = 8; // generate/update every 8 messages
const SUMMARY_INPUT_MESSAGES = 20; // use last 20 messages as input
const SUMMARY_MAX_TOKENS = 150;

// ── Summarization Prompt ───────────────────────────────────────
function buildSummarizationPrompt(
  conversationText: string,
  existingSummary: string
): string {
  return `Summarize this conversation in 3-5 concise sentences. Focus on:
- The user's current emotional state
- Key topics discussed
- Any ongoing concerns or goals

${existingSummary ? `Previous summary: ${existingSummary}\n` : ""}
Recent conversation:
${conversationText}

Summary:`;
}

// ── Title Generation Prompt ────────────────────────────────────
function buildTitlePrompt(userMsg: string, aiMsg: string): string {
  return `Generate a 2-4 word title for this therapy conversation.
User: ${userMsg.slice(0, 120)}
AI: ${aiMsg.slice(0, 120)}
Title:`;
}

// ── Should We Update the Summary? ──────────────────────────────
export function shouldUpdateSummary(
  messageCount: number,
  hasSummary: boolean
): boolean {
  // Generate first summary after 8 messages, then every 8 after
  if (messageCount < SUMMARY_INTERVAL) return false;
  if (!hasSummary) return true;
  return messageCount % SUMMARY_INTERVAL === 0;
}

// ── Generate & Save Summary ────────────────────────────────────
/**
 * Generates a new summary using Ollama and saves it atomically.
 * Uses $set to avoid the race condition that existed with .save().
 */
export async function updateSummary(
  sessionId: string,
  messages: SimpleMessage[],
  existingSummary: string
): Promise<void> {
  try {
    // Take the last N messages for summarization
    const recentForSummary = messages.slice(-SUMMARY_INPUT_MESSAGES);
    const conversationText = formatMessagesForPrompt(recentForSummary);

    const prompt = buildSummarizationPrompt(conversationText, existingSummary);

    logger.info("📝 Summarizer: generating summary via Ollama", {
      sessionId,
      inputMessages: recentForSummary.length,
    });

    const newSummary = await ollamaGenerate(prompt, {
      num_predict: SUMMARY_MAX_TOKENS,
      temperature: 0.3,
    });

    // Atomic update — no race condition with concurrent message saves
    await ChatSession.updateOne(
      { sessionId },
      { $set: { summary: newSummary.trim() } }
    );

    logger.info("✅ Summarizer: summary updated", { sessionId });
  } catch (error) {
    // Summarization failure is non-critical — log and move on
    logger.warn("⚠️ Summarizer: failed to update summary", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Generate Session Title ─────────────────────────────────────
/**
 * Generates a short title for the session using Ollama.
 * Returns null if generation fails (non-critical).
 */
export async function generateTitle(
  userMsg: string,
  aiMsg: string
): Promise<string | null> {
  try {
    const prompt = buildTitlePrompt(userMsg, aiMsg);
    const title = await ollamaGenerate(prompt, {
      num_predict: 12,
      temperature: 0.3,
    });
    const cleaned = title.replace(/^["']|["']$/g, "").trim();
    return cleaned.length > 2 ? cleaned : null;
  } catch {
    return null;
  }
}
