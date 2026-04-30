import { Types } from "mongoose";

export type Intent = "task" | "support" | "general";

export interface AuthUser {
  _id: Types.ObjectId;
  email?: string;
  name?: string;
}

export interface MessageAnalysis {
  emotionalState: string;
  themes: string[];
  riskLevel: number;
  recommendedApproach: string;
  progressIndicators: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: {
    analysis?: MessageAnalysis;
    currentGoal?: string | null;
    progress?: {
      emotionalState?: string;
      riskLevel?: number;
    };
  };
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}
