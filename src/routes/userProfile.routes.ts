import { Router } from "express";

import { authenticate } from "../middleware/auth";
import { UserProfileController } from "../controllers/userProfile.controller";

const router = Router();

/**
 * @openapi
 * /users/me:
 *   get:
 *     summary: Get authenticated user's profile
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 email:
 *                   type: string
 *                 firstName:
 *                   type: string
 *                   nullable: true
 *                 lastName:
 *                   type: string
 *                   nullable: true
 *                 name:
 *                   type: string
 *                 role:
 *                   type: string
 *                   enum: [customer, supplier, admin]
 *                 status:
 *                   type: string
 *                 phone:
 *                   type: string
 *                   nullable: true
 *                 company:
 *                   type: string
 *                   nullable: true
 *                 emailVerified:
 *                   type: boolean
 *                 vendorId:
 *                   type: string
 *                   nullable: true
 *                 commissionRate:
 *                   type: number
 *                   nullable: true
 *                 vendorStatus:
 *                   type: string
 *                   nullable: true
 *                 currentBalance:
 *                   type: number
 *                   nullable: true
 *                 createdAt:
 *                   type: string
 *                 lastLogin:
 *                   type: string
 *                   nullable: true
 *       401:
 *         description: Not authenticated
 */
router.get("/me", authenticate, UserProfileController.getProfile);

/**
 * @openapi
 * /users/me:
 *   put:
 *     summary: Update profile fields
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               lastName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *                 nullable: true
 *               companyName:
 *                 type: string
 *                 maxLength: 200
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Validation error
 *       401:
 *         description: Not authenticated
 */
router.put("/me", authenticate, UserProfileController.updateProfile);

/**
 * @openapi
 * /users/me/change-password:
 *   post:
 *     summary: Change password
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Weak password or same as current
 *       401:
 *         description: Current password incorrect or not authenticated
 */
router.post("/me/change-password", authenticate, UserProfileController.changePassword);

export default router;
