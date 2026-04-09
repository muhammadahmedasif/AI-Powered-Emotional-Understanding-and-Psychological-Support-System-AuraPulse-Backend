import mongoose from "mongoose";
import { logger } from "./logger";

const MONGODB_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in environment variables");
    }

    const conn = await mongoose.connect(MONGODB_URI);
    logger.info(`Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error("MongoDB connection error:", error);
    process.exit(1);
  }
};
