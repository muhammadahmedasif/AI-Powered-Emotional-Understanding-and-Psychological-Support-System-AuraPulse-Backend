import express from "express";
import { auth } from "../middleware/auth";
import {
  createMood,
  getMoodHistory,
  getMoodStats,
} from "../controllers/mood";

const router = express.Router();

// All routes are protected with authentication
router.use(auth);

// Get mood history
router.get("/history", getMoodHistory);

// Get mood statistics
router.get("/stats", getMoodStats);

// Track a new mood entry
router.post("/", createMood);

export default router;
