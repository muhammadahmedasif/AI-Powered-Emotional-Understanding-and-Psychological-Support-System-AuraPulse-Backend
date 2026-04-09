import { Router } from "express";
import { register, login, logout, forgotPassword, resetPassword } from "../controllers/authController";
import { auth } from "../middleware/auth";

const router = Router();

// POST /auth/register
router.post("/register", register);

// POST /auth/login
router.post("/login", login);

// POST /auth/logout
router.post("/logout", auth, logout);

// POST /auth/forgot-password
router.post("/forgot-password", forgotPassword);

// POST /auth/reset-password
router.post("/reset-password", resetPassword);


// GET /auth/me
router.get("/me", auth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
