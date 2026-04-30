import express from "express";
import { auth } from "../middleware/auth";
import {
  logActivity,
  getActivities,
  getTodayActivities,
} from "../controllers/activity";

const router = express.Router();

// All routes are protected with authentication
router.use(auth);

// Get all activities
router.get("/", getActivities);

// Get today's activities
router.get("/today", getTodayActivities);

// Log a new activity
router.post("/", logActivity);

export default router;
