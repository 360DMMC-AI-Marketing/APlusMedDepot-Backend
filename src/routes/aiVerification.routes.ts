import { Router } from "express";
import rateLimit from "express-rate-limit";

import { AIVerificationController } from "../controllers/aiVerification.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

const aiVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many AI verification requests. Please wait before trying again.",
    },
  },
});

/**
 * @openapi
 * /admin/vendors/{id}/ai-verify:
 *   post:
 *     summary: Run AI-powered verification analysis on a vendor application
 *     description: >
 *       Uses Claude AI to analyze vendor application data and return a risk
 *       assessment score, recommendation, and detailed checks. Admin only.
 *     tags: [Admin - AI Verification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Vendor (supplier) ID
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 score:
 *                   type: number
 *                   minimum: 0
 *                   maximum: 100
 *                 recommendation:
 *                   type: string
 *                   enum: [approve, review, reject]
 *                 checks:
 *                   type: object
 *                   properties:
 *                     businessInfo:
 *                       type: object
 *                       properties:
 *                         passed:
 *                           type: boolean
 *                         notes:
 *                           type: string
 *                     documentation:
 *                       type: object
 *                       properties:
 *                         passed:
 *                           type: boolean
 *                         notes:
 *                           type: string
 *                     riskAssessment:
 *                       type: object
 *                       properties:
 *                         passed:
 *                           type: boolean
 *                         notes:
 *                           type: string
 *                 missingItems:
 *                   type: array
 *                   items:
 *                     type: string
 *                 riskFactors:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Vendor not found
 *       429:
 *         description: Rate limit exceeded
 *       502:
 *         description: AI service error
 *       503:
 *         description: AI verification not configured
 */
router.post(
  "/:id/ai-verify",
  authenticate,
  authorize("admin"),
  aiVerifyLimiter,
  AIVerificationController.verifyVendor,
);

export default router;
