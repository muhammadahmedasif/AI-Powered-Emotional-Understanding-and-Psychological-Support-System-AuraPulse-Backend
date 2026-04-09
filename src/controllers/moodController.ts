import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Mood } from "../models/Mood";
import { logger } from "../utils/logger";
import { sendMoodUpdateEvent } from "../utils/inngestEvents";

// Create a new mood entry
export const createMood = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { score, note } = req.body;
    const userId = req.user?._id; // From auth middleware

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const mood = new Mood({
      userId,
      score,
      note,
      timestamp: new Date(),
    });

    await mood.save();
    logger.info(`Mood entry created for user ${userId}`);

    // Send mood update event to Inngest
    await sendMoodUpdateEvent({
      userId,
      mood: score,
      note,
      timestamp: mood.timestamp,
    });

    res.status(201).json({
      success: true,
      data: mood,
    });
  } catch (error) {
    next(error);
  }
};

// Get mood history with optional filtering and pagination
export const getMoodHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { startDate, endDate, limit } = req.query;

    const query: any = { userId };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }

    let moodQuery = Mood.find(query).sort({ timestamp: -1 });

    if (limit) {
      moodQuery = moodQuery.limit(parseInt(limit as string, 10));
    }

    const moods = await moodQuery;

    res.status(200).json({
      success: true,
      data: moods,
    });
  } catch (error) {
    next(error);
  }
};

// Get mood statistics for a specific period
export const getMoodStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { period = "month" } = req.query; // 'week', 'month', 'year'

    const now = new Date();
    const startDate = new Date();

    if (period === "week") {
      startDate.setDate(now.getDate() - 7);
    } else if (period === "month") {
      startDate.setMonth(now.getMonth() - 1);
    } else if (period === "year") {
      startDate.setFullYear(now.getFullYear() - 1);
    } else {
      return res.status(400).json({ message: "Invalid period specified. Use 'week', 'month', or 'year'." });
    }

    const stats = await Mood.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId as string),
          timestamp: { $gte: startDate, $lte: now },
        },
      },
      {
        $group: {
          _id: null,
          averageScore: { $avg: "$score" },
          count: { $sum: 1 },
          highestScore: { $max: "$score" },
          lowestScore: { $min: "$score" },
        },
      },
    ]);

    logger.debug(`Mood stats aggregation for user ${userId}:`, { period, count: stats.length > 0 ? stats[0].count : 0 });

    const result = stats.length > 0 ? stats[0] : {
      averageScore: 0,
      count: 0,
      highestScore: 0,
      lowestScore: 0,
    };

    delete result._id; // Remove the internal aggregation ID

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
