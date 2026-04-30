import nodemailer from "nodemailer";
import { logger } from "../utils/logger";

// Create a transporter instance. If SMTP settings are missing, it will still be created,
// but sendMail will fail gracefully or warn.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_PORT === "465", // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

/**
 * Sends a password reset email to the user.
 * @param to The recipient's email address
 * @param resetLink The full URL for resetting the password
 */
export const sendPasswordResetEmail = async (to: string, resetLink: string) => {
  // If no SMTP user is configured, log a warning and skip sending to avoid crash
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn(`SMTP credentials missing. Would have sent reset email to ${to} with link: ${resetLink}`);
    return;
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"AuraPulse Support" <noreply@aurapulse.com>',
    to,
    subject: "Reset Your Password - AuraPulse",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #0f766e;">Password Reset Request</h2>
        <p>Hello,</p>
        <p>We received a request to reset the password for your AuraPulse account. If you didn't make this request, you can safely ignore this email.</p>
        <p>To reset your password, please click the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0f766e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666; font-size: 14px;">${resetLink}</p>
        <p style="margin-top: 40px; font-size: 14px; color: #888;">
          Best regards,<br>
          The AuraPulse Team
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Password reset email sent to ${to}. Message ID: ${info.messageId}`);
  } catch (error) {
    logger.error(`Failed to send password reset email to ${to}:`, error);
    // Don't throw the error, just log it so the API request doesn't crash
  }
};
