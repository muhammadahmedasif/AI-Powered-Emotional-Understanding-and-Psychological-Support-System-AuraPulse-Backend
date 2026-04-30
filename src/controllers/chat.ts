import { Request, Response } from "express";
import { ChatSession } from "../models/ChatSession";
import { randomUUID } from "crypto";
import { logger } from "../utils/logger";
import { User } from "../models/User";
import { Types } from "mongoose";
import { generateResponse } from "../services/ai";
import { 
  generateAIResponseStream, 
  buildRecentContext 
} from "../services/prompt.service";
import { MessageAnalysis } from "../types";

const RECENT_MESSAGE_LIMIT = 2;
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

  const olderMessages = messages.slice(0, -RECENT_MESSAGE_LIMIT);
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
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a unique sessionId
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

    // Add message to session history
    session.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    session.messages.push({
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
    });

    // Save the updated session
    await session.save();

    // Update summary in background — don't block the response
    updateSessionSummary(session).catch((err) =>
      logger.warn("Background summary update failed", { error: String(err) })
    );

    logger.info("Session updated successfully:", { sessionId });

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
  } catch (error) {
    logger.error("Error in sendMessage:", error);
    res.status(500).json({
      message: "Error processing message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
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

    // Find session by sessionId instead of _id
    const session = await ChatSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized" });
    }

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
      .select('sessionId title startTime status')
      .sort({ startTime: -1 });
    res.json(sessions);
  } catch (error) {
    logger.error("Error fetching user sessions:", error);
    res.status(500).json({ message: "Error fetching user sessions" });
  }
};