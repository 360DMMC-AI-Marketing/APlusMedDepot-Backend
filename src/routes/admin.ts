import { Router, Request, Response } from "express";

import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: List all users (stub)
 *     description: Returns all users. Admin only. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/users", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all users (admin only)" });
});

/**
 * @openapi
 * /admin/users/{id}/role:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Update user role (stub)
 *     description: Update a user's role. Admin only. Currently a TODO stub.
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
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.put("/users/:id/role", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update user role (admin only)" });
});

/**
 * @openapi
 * /admin/users/{id}/status:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Enable/disable user account (stub)
 *     description: Enable or disable a user account. Admin only. Currently a TODO stub.
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
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.put("/users/:id/status", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Enable/disable user account (admin only)" });
});

/**
 * @openapi
 * /admin/orders:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: List all orders (stub)
 *     description: Returns all orders. Admin only. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/orders", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all orders (admin only)" });
});

/**
 * @openapi
 * /admin/suppliers/pending:
 *   get:
 *     tags: [Admin - Users]
 *     summary: List pending supplier applications (stub)
 *     description: Returns pending supplier applications. Admin only. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/suppliers/pending", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List pending supplier applications (admin only)" });
});

/**
 * @openapi
 * /admin/suppliers/{id}/approve:
 *   put:
 *     tags: [Admin - Users]
 *     summary: Approve supplier application (stub)
 *     description: Approve a supplier application. Admin only. Currently a TODO stub.
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
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.put("/suppliers/:id/approve", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Approve supplier application (admin only)" });
});

/**
 * @openapi
 * /admin/analytics:
 *   get:
 *     tags: [Admin - Analytics]
 *     summary: Get platform-wide analytics (stub)
 *     description: Returns platform-wide analytics. Admin only. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/analytics", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get platform-wide analytics (admin only)" });
});

export default router;
