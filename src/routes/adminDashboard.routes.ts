import { Router } from "express";

import { AdminDashboardController } from "../controllers/adminDashboard.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

/**
 * @openapi
 * /admin/dashboard:
 *   get:
 *     summary: Admin dashboard summary
 *     description: Returns aggregated data for the admin dashboard including pending actions, revenue, orders, and platform health.
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary object
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not an admin
 */
router.get("/", AdminDashboardController.getSummary);

export default router;
