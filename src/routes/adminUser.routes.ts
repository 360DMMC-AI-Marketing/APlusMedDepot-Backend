import { Router } from "express";

import { AdminUserController } from "../controllers/adminUser.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { withAuditContext } from "../middleware/auditMiddleware";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));
router.use(withAuditContext);

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: List all users
 *     description: Returns a paginated list of all users with filtering options. Admin only.
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
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated user list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/", AdminUserController.list);

/**
 * @openapi
 * /admin/users/pending-count:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Get pending user count
 *     description: Returns count of users pending approval. Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending count
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/pending-count", AdminUserController.getPendingCount);

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Get user details
 *     description: Returns full details for a specific user. Admin only.
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
 *         description: User details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: User not found
 */
router.get("/:id", AdminUserController.getDetail);

/**
 * @openapi
 * /admin/users/{id}/approve:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Approve a user
 *     description: Approve a pending user account. Admin only.
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
 *         description: User approved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: User not found
 */
router.put("/:id/approve", AdminUserController.approve);

/**
 * @openapi
 * /admin/users/{id}/reject:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Reject a user
 *     description: Reject a pending user account. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User rejected
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: User not found
 */
router.put("/:id/reject", AdminUserController.reject);

/**
 * @openapi
 * /admin/users/{id}/suspend:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Suspend a user
 *     description: Suspend an active user account. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: User suspended
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: User not found
 */
router.put("/:id/suspend", AdminUserController.suspend);

/**
 * @openapi
 * /admin/users/{id}/reactivate:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Reactivate a user
 *     description: Reactivate a suspended user account. Admin only.
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
 *         description: User reactivated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: User not found
 */
router.put("/:id/reactivate", AdminUserController.reactivate);

export default router;
