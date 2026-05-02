/**
 * Memory Service
 * ──────────────
 * Handles retrieval and formatting of conversation messages
 * for prompt construction. Keeps context token-efficient.
 */

// ── Constants ──────────────────────────────────────────────────
const MAX_RECENT_MESSAGES = 10; // 5 user + 5 assistant turns
const MAX_MESSAGE_LENGTH = 400; // truncate individual messages

// ── Types ──────────────────────────────────────────────────────
export interface SimpleMessage {
  role: string;
  content: string;
}

// ── Get Recent Messages ────────────────────────────────────────
/**
 * Returns the last N messages from the conversation.
 * Truncates individual messages that are too long.
 */
export function getRecentMessages(
  messages: SimpleMessage[],
  maxCount: number = MAX_RECENT_MESSAGES
): SimpleMessage[] {
  // Take only the last maxCount messages
  const recent = messages.slice(-maxCount);

  // Truncate long messages for token efficiency
  return recent.map((msg) => ({
    role: msg.role,
    content: truncateText(msg.content, MAX_MESSAGE_LENGTH),
  }));
}

// ── Format Messages for Prompt ─────────────────────────────────
/**
 * Converts an array of messages into a formatted string
 * suitable for injection into the prompt.
 */
export function formatMessagesForPrompt(messages: SimpleMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" : "Maya";
      return `${role}: ${msg.content}`;
    })
    .join("\n");
}

// ── Helpers ────────────────────────────────────────────────────
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
