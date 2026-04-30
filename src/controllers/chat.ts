import { Request, Response } from "express";
import { ChatSession } from "../models/ChatSession";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";
import { Types } from "mongoose";
import { generateResponse } from "../services/ai";
import { 
  generateAIResponseStream, 
  buildRecentContext 
} from "../services/prompt.service";
import { MessageAnalysis } from "../types";


const MEMORY_UPDATE_INTERVAL = 10;

const defaultAnalysis: MessageAnalysis = {
  emotionalState: "neutral",
  themes: [],
  riskLevel: 0,
  recommendedApproach: "supportive",
  progressIndicators: [],
};

async function updateSessionSummary(session: any) {
  const messages = session.messages.map((item: any) => ({
    role: item.role,
    content: item.content,
  }));

  const olderMessages = messages.slice(0, -2);
  const shouldUpdate =
    olderMessages.length > 0 &&
    (!session.summary || messages.length % MEMORY_UPDATE_INTERVAL === 0);

  if (!shouldUpdate) {
    return;
  }

  const history = buildRecentContext(olderMessages, 20);
  const prompt = `Summarize this mental health chat memory in 2-4 sentences. Focus on durable context (goals, concerns, safety).
Existing: ${session.summary || "None"}
New: ${history}`;

  try {
    session.summary = await generateResponse(prompt, { num_predict: 100, temperature: 0.3 });
    await session.save();
  } catch (error) {
    logger.warn("Could not update chat summary", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Create a new chat session
export const createChatSession = async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res
        .status(401)
        .json({ message: "Unauthorized - User not authenticated" });
    }

    const userId = req.user._id;

    const sessionId = randomUUID();

    const session = new ChatSession({
      sessionId,
      userId,
      title: "New Therapy Session",
      startTime: new Date(),
      status: "active",
      messages: [],
    });

    await session.save();

    res.status(201).json({
      message: "Chat session created successfully",
      sessionId: session.sessionId,
    });
  } catch (error) {
    logger.error("Error creating chat session:", error);
    res.status(500).json({
      message: "Error creating chat session",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Send a message in the chat session
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Message is required" });
    }

    logger.info("Processing chat message", { sessionId });

    // Find session by sessionId
    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      logger.warn("Session not found:", { sessionId });
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      logger.warn("Unauthorized access attempt:", { sessionId, userId });
      return res.status(403).json({ message: "Unauthorized" });
    }

    const recentMessagesString = buildRecentContext(
      session.messages.map((item) => ({
        role: item.role,
        content: item.content,
      }))
    );
    const summary = session.summary || "";

    // Abort controller to stop AI generation if client disconnects
    const abortController = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) {
        logger.info("Client disconnected, aborting AI stream", { sessionId });
        abortController.abort();
      }
    });

    // Single AI call for response, streaming text as it arrives
    const { reply, analysis } = await generateAIResponseStream(
      message,
      recentMessagesString,
      summary,
      (chunk) => {
        res.write(JSON.stringify({ t: "chunk", d: chunk }) + "\n");
      },
      abortController.signal
    );

    logger.info("Generated response successfully", {
      sessionId,
      riskLevel: analysis.riskLevel,
    });

    // Use atomic update to push both messages at once
    const updatedSession = await ChatSession.findOneAndUpdate(
      { sessionId, userId },
      { 
        $push: { 
          messages: { 
            $each: [
              {
                role: "user",
                content: message,
                timestamp: new Date()
              },
              {
                role: "assistant",
                content: reply,
                timestamp: new Date(),
                metadata: {
                  analysis,
                  progress: {
                    emotionalState: analysis.emotionalState,
                    riskLevel: analysis.riskLevel,
                  },
                },
              }
            ] 
          } 
        }
      },
      { new: true }
    );

    if (updatedSession) {
      logger.info("Session updated atomically", { 
        sessionId, 
        messageCount: updatedSession.messages.length 
      });

      // Update title if it's still the default
      if (updatedSession.messages.length >= 2 && (updatedSession.title === "New Session" || updatedSession.title === "New Therapy Session")) {
        generateSessionTitle(message, reply).then(title => {
          if (title && title.length > 3) {
            ChatSession.updateOne({ sessionId }, { title }).catch(err => logger.error("Title update error", err));
          }
        }).catch(err => logger.error("Title generation error", err));
      }

      // Update summary in background
      updateSessionSummary(updatedSession).catch((err) =>
        logger.warn("Background summary update failed", { error: String(err) })
      );
    }

    // Send final completion message with metadata
    res.write(JSON.stringify({
      t: "done",
      analysis,
      metadata: {
        progress: {
          emotionalState: analysis.emotionalState,
          riskLevel: analysis.riskLevel,
        }
      }
    }) + "\n");
    res.end();
    logger.info("Session updated successfully:", { sessionId });
  } catch (error) {
    logger.error("Error in sendMessage:", error);
    if (!res.headersSent) {
      res.status(500).json({ message: "Error processing message" });
    }
  }
};

export const getChatSession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;

    logger.info(`Getting chat session: ${sessionId}`);
    const chatSession = await ChatSession.findOne({ sessionId, userId });

    if (!chatSession) {
      logger.warn(`Chat session not found: ${sessionId}`);
      return res.status(404).json({ error: "Chat session not found" });
    }
    logger.info(`Found chat session: ${sessionId}`);
    res.json(chatSession);
  } catch (error) {
    logger.error("Failed to get chat session:", error);
    res.status(500).json({ error: "Failed to get chat session" });
  }
};

export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id;
    logger.info(`Fetching chat history`, { sessionId, userId: userId.toString() });
    
    // 1. Try finding by UUID
    let session = await ChatSession.findOne({ sessionId });
    
    // 2. Fallback to _id if not found and sessionId looks like an ObjectId
    if (!session && Types.ObjectId.isValid(sessionId)) {
      session = await ChatSession.findById(sessionId);
    }
    
    if (!session) {
      logger.warn(`Session not found in DB with either ID type`, { sessionId });
      return res.status(404).json({ message: "Session not found" });
    }

    logger.info(`Session found`, { 
      sessionId: session.sessionId, 
      ownerId: session.userId.toString(),
      requestUserId: userId.toString(),
      messagesCount: session.messages.length 
    });

    if (session.userId.toString() !== userId.toString()) {
      logger.warn(`Ownership mismatch`, {
        sessionId,
        ownerId: session.userId.toString(),
        requestUserId: userId.toString()
      });
      return res.status(403).json({ message: "Unauthorized" });
    }

    logger.info(`Returning ${session.messages.length} messages to client`);
    res.json(session.messages);
  } catch (error) {
    logger.error("Error fetching chat history:", error);
    res.status(500).json({ message: "Error fetching chat history" });
  }
};

export const getUserSessions = async (req: Request, res: Response) => {
  try {
    const userId = req.user._id;
    const sessions = await ChatSession.find({ userId })
      .select("sessionId title startTime status messages")
      .sort({ startTime: -1 });

    const sessionsWithPreview = sessions.map((session) => {
      const lastMessage = session.messages.length > 0 
        ? session.messages[session.messages.length - 1] 
        : null;
      return {
        sessionId: session.sessionId,
        title: session.title,
        startTime: session.startTime,
        status: session.status,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          timestamp: lastMessage.timestamp
        } : null,
        messageCount: session.messages.length
      };
    });
    res.json(sessionsWithPreview);
  } catch (error) {
    logger.error("Error fetching user sessions:", error);
    res.status(500).json({ message: "Error fetching user sessions" });
  }
};

/**
 * Generate a concise title for the session based on the first exchange.
 * Uses the existing Ollama service for consistency.
 */
async function generateSessionTitle(userMsg: string, aiMsg: string): Promise<string | null> {
  try {
    const prompt = `Generate a 2-4 word title for this therapy session based on the exchange.\nUser: ${userMsg.slice(0, 100)}\nAI: ${aiMsg.slice(0, 100)}\nTitle:`;
    const title = await generateResponse(prompt, { num_predict: 10, temperature: 0.3 });
    return title.replace(/^["']|["']$/g, "").trim() || null;
  } catch {
    return null;
  }
}