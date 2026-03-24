import { Router } from "express";

import { NotificationController } from "../controllers/notification.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const userRouter = Router();
const adminRouter = Router();

// ── User notification routes (any authenticated user) ───────────────────

userRouter.use(authenticate);

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: unreadOnly
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *     responses:
 *       200:
 *         description: Paginated notifications
 */
userRouter.get("/", NotificationController.getMyNotifications);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 */
userRouter.get("/unread-count", NotificationController.getUnreadCount);

/**
 * @openapi
 * /notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All marked as read
 */
userRouter.put("/read-all", NotificationController.markAllAsRead);

/**
 * @openapi
 * /notifications/{id}/read:
 *   put:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 */
userRouter.put("/:id/read", NotificationController.markAsRead);

/**
 * @openapi
 * /notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification deleted
 *       404:
 *         description: Notification not found
 */
userRouter.delete("/:id", NotificationController.deleteNotification);

// ── Admin notification routes ───────────────────────────────────────────

adminRouter.use(authenticate);
adminRouter.use(authorize("admin"));

/**
 * @openapi
 * /admin/notifications/bulk:
 *   post:
 *     summary: Send bulk notification to specific users
 *     tags: [Admin Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, type, title, message]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               type:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               sendEmail:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Sent and failed counts
 */
adminRouter.post("/bulk", NotificationController.sendBulkNotification);

/**
 * @openapi
 * /admin/notifications/role:
 *   post:
 *     summary: Send notification to all users with a specific role
 *     tags: [Admin Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, type, title, message]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [customer, supplier]
 *               type:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               sendEmail:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Sent and failed counts
 */
adminRouter.post("/role", NotificationController.sendRoleNotification);

export { userRouter as notificationUserRouter, adminRouter as notificationAdminRouter };
