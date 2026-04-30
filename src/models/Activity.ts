import mongoose, { Document, Schema } from "mongoose";

export interface IActivity extends Document {
  userId: mongoose.Types.ObjectId;
  type: string;
  name: string;
  description?: string;
  duration?: number;
  completed: boolean;
  timestamp: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "meditation",
        "exercise",
        "walking",
        "reading",
        "journaling",
        "therapy",
        "game",
      ],
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    duration: {
      type: Number,
      min: 0,
    },
    completed: {
      type: Boolean,
      default: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
activitySchema.index({ userId: 1, timestamp: -1 });

export const Activity = mongoose.model<IActivity>("Activity", activitySchema);
