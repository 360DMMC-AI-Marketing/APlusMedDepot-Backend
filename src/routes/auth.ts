import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { AuthController } from "../controllers/auth.controller";

const router = Router();

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
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
router.post("/register", authRateLimiter, AuthController.register);

router.post("/login", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Authenticate user and return JWT" });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Invalidate user session" });
});

router.post("/refresh", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Refresh access token" });
});

router.post("/forgot-password", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Send password reset email" });
});

router.post("/reset-password", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Reset user password with token" });
});

export default router;
