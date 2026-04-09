import { Request, Response, NextFunction } from "express";
import { Activity } from "../models/Activity";
import { logger } from "../utils/logger";
import { sendActivityCompletionEvent } from "../utils/inngestEvents";

// Log a new activity
export const logActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, name, description, duration } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const activity = new Activity({
      userId,
      type,
      name,
      description,
      duration,
      timestamp: new Date(),
    });

    await activity.save();
    logger.info(`Activity logged for user ${userId}`);

    // Send activity completion event to Inngest
    await sendActivityCompletionEvent({
      userId,
      id: activity._id,
      type,
      name,
      duration,
      timestamp: activity.timestamp,
    });

    res.status(201).json({
      success: true,
      data: activity,
    });
  } catch (error) {
    next(error);
  }
};

// Get all activities for the user
export const getActivities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const activities = await Activity.find({ userId }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
};

// Get today's activities for the user
export const getTodayActivities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const activities = await Activity.find({
      userId,
      timestamp: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
};
