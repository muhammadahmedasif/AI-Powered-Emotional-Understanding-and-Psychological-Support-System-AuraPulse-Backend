import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { AuthUser } from "../types";

interface JwtPayload {
  userId: string;
}

export const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your-secret-key"
    ) as JwtPayload;
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = {
      _id: user._id as any,
      email: user.email,
      name: user.name,
      profileImage: user.profileImage,
      aiName: user.aiName,
      aiBehavior: user.aiBehavior,
      aiAvatar: user.aiAvatar,
    };
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid authentication token" });
  }
};
