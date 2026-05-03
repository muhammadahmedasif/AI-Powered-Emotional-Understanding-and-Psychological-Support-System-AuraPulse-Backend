import { Request, Response, RequestHandler } from "express";
import { User } from "../models/User";
import { logger } from "../utils/logger";
import { uploadImage } from "../services/cloudinary.service";

/**
 * Update user profile details (name, email, profileImage)
 */
export const updateProfile: RequestHandler = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email, profileImage, aiName, aiBehavior, aiAvatar } = req.body;

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (aiName !== undefined) updateData.aiName = aiName;
    if (aiBehavior !== undefined) updateData.aiBehavior = aiBehavior;
    if (aiAvatar !== undefined) updateData.aiAvatar = aiAvatar;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    logger.error("Error updating profile:", error);
    res.status(500).json({
      message: "Error updating profile",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get current user profile
 */
export const getProfile: RequestHandler = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    logger.error("Error fetching profile:", error);
    res.status(500).json({
      message: "Error fetching profile",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Upload profile avatar to Cloudinary
 */
export const uploadAvatar: RequestHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    logger.info("📤 Uploading avatar to Cloudinary...");
    const imageUrl = await uploadImage(req.file.buffer);

    res.status(200).json({
      message: "Image uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    logger.error("Error uploading avatar:", error);
    res.status(500).json({
      message: "Error uploading avatar",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
/**
 * Upload AI avatar to Cloudinary
 */
export const uploadAiAvatar: RequestHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    logger.info("📤 Uploading AI avatar to Cloudinary...");
    const imageUrl = await uploadImage(req.file.buffer);

    res.status(200).json({
      message: "AI Avatar uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    logger.error("Error uploading AI avatar:", error);
    res.status(500).json({
      message: "Error uploading AI avatar",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
