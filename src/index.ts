import dotenv from "dotenv";
// Load environment variables FIRST before any other imports
dotenv.config();

import "./types";
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./utils/logger";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import moodRouter from "./routes/mood";
import activityRouter from "./routes/activity";
import userRouter from "./routes/user";
import { connectDB } from "./utils/db";

// Create Express app
const app: any = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(morgan("dev")); // HTTP request logger

// Routes
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "Server is running" });
});

// API Routes
app.use("/api/auth", authRouter);
app.use("/api/chat", chatRouter);
app.use("/api/mood", moodRouter);
app.use("/api/activity", activityRouter);
app.use("/api/user", userRouter);

// Backward compatibility
app.use("/auth", authRouter);
app.use("/chat", chatRouter);
app.use("/mood", moodRouter);
app.use("/activity", activityRouter);
app.use("/user", userRouter);

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
