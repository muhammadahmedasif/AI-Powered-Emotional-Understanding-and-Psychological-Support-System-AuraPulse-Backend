import { Router } from "express";
import { updateProfile, getProfile, uploadAvatar, uploadAiAvatar } from "../controllers/user";
import { auth } from "../middleware/auth";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// All user routes require authentication
router.use(auth);

router.get("/me", getProfile);
router.put("/profile", updateProfile);
router.post("/upload-avatar", upload.single("image") as any, uploadAvatar);
router.post("/upload-ai-avatar", upload.single("image") as any, uploadAiAvatar);

export default router;
