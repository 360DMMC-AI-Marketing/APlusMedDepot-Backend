import { Router } from "express";

import { AdminOrderController } from "../controllers/adminOrder.controller";
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
 * /admin/orders:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: List all orders
 *     description: Returns a paginated list of all orders with filtering options. Admin only.
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
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated order list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/", AdminOrderController.list);

/**
 * @openapi
 * /admin/orders/search:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: Search orders
 *     description: Search orders by various criteria. Admin only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Matching orders
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/search", AdminOrderController.search);

/**
 * @openapi
 * /admin/orders/status-counts:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: Get order status counts
 *     description: Returns aggregate counts of orders grouped by status. Admin only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status count breakdown
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/status-counts", AdminOrderController.getStatusCounts);

/**
 * @openapi
 * /admin/orders/{id}:
 *   get:
 *     tags: [Admin - Orders]
 *     summary: Get order details
 *     description: Returns full details of a specific order including items and sub-orders. Admin only.
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
 *         description: Order details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Order not found
 */
router.get("/:id", AdminOrderController.getDetail);

export default router;
