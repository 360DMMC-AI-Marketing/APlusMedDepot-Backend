import { Router } from "express";
import rateLimit from "express-rate-limit";

import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { verifyCaptcha } from "../middleware/captcha";

const router = Router();

const registerRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
  },
});

const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
  },
});

const passwordRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" },
  },
});

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 required: [email, password, firstName, lastName, companyName, role]
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                   password:
 *                     type: string
 *                     minLength: 8
 *                     description: Must contain uppercase, lowercase, number, and special character
 *                   firstName:
 *                     type: string
 *                     minLength: 1
 *                     maxLength: 50
 *                   lastName:
 *                     type: string
 *                     minLength: 1
 *                     maxLength: 50
 *                   companyName:
 *                     type: string
 *                     minLength: 1
 *                     maxLength: 200
 *                   phone:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [customer]
 *               - type: object
 *                 required: [email, password, firstName, lastName, role]
 *                 properties:
 *                   email:
 *                     type: string
 *                     format: email
 *                   password:
 *                     type: string
 *                     minLength: 8
 *                   firstName:
 *                     type: string
 *                     minLength: 1
 *                     maxLength: 50
 *                   lastName:
 *                     type: string
 *                     minLength: 1
 *                     maxLength: 50
 *                   phone:
 *                     type: string
 *                   role:
 *                     type: string
 *                     enum: [supplier]
 *     responses:
 *       201:
 *         description: Registration successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     companyName:
 *                       type: string
 *                       nullable: true
 *                     role:
 *                       type: string
 *                       enum: [customer, supplier]
 *                     status:
 *                       type: string
 *                       enum: [pending]
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/register", registerRateLimiter, verifyCaptcha, AuthController.register);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate user and return JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 1
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [customer, supplier, admin]
 *                     status:
 *                       type: string
 *                 session:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresAt:
 *                       type: number
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account pending approval or suspended
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/login", loginRateLimiter, verifyCaptcha, AuthController.login);

/**
 * @openapi
 * /auth/session:
 *   get:
 *     summary: Get current session info
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 session:
 *                   type: object
 *       401:
 *         description: Invalid or expired token
 */
router.get("/session", authenticate, AuthController.getSession);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Log out and invalidate session
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Missing or invalid token
 */
router.post("/logout", AuthController.logout);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 session:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     expiresAt:
 *                       type: number
 *       401:
 *         description: Invalid refresh token
 */
router.post("/refresh", AuthController.refreshToken);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Always returns 200 regardless of email existence
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/forgot-password", passwordRateLimiter, AuthController.forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with recovery token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: Must contain uppercase, lowercase, number, and special character
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid or expired token
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/reset-password", passwordRateLimiter, AuthController.resetPassword);

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     summary: Verify email address with token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid or expired token
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/verify-email", passwordRateLimiter, AuthController.verifyEmail);

/**
 * @openapi
 * /auth/resend-verification:
 *   post:
 *     summary: Resend email verification link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification email sent (if applicable)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       409:
 *         description: Email is already verified
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/resend-verification", passwordRateLimiter, AuthController.resendVerification);

export default router;
