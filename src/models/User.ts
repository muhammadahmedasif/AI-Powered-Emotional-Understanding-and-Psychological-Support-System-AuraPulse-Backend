import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  profileImage: string;
  aiName: string;
  aiBehavior: "supportive" | "friendly" | "motivational" | "calm";
  aiAvatar: string;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profileImage: { type: String, default: "" },
    aiName: { type: String, default: "Maya" },
    aiBehavior: { 
      type: String, 
      enum: ["supportive", "friendly", "motivational", "calm"], 
      default: "supportive" 
    },
    aiAvatar: { type: String, default: "" },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", UserSchema);
