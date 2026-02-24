import { Router } from "express";

import { SupplierOrderController } from "../controllers/supplierOrder.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /suppliers/me/orders:
 *   get:
 *     summary: List supplier's orders
 *     description: Returns paginated sub-orders for the authenticated supplier with commission breakdown.
 *     tags: [Supplier Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by order status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: Filter orders created on or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: Filter orders created on or before this date
 *     responses:
 *       200:
 *         description: Paginated list of supplier orders
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
router.get("/", authenticate, authorize("supplier"), SupplierOrderController.list);

/**
 * @openapi
 * /suppliers/me/orders/stats:
 *   get:
 *     summary: Get order statistics
 *     description: Returns order counts, revenue, average order value, and status breakdown.
 *     tags: [Supplier Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order statistics
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
router.get("/stats", authenticate, authorize("supplier"), SupplierOrderController.getStats);

/**
 * @openapi
 * /suppliers/me/orders/{id}:
 *   get:
 *     summary: Get order detail
 *     description: Returns full order detail with items, commission breakdown, shipping address, and status history.
 *     tags: [Supplier Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Sub-order ID
 *     responses:
 *       200:
 *         description: Order detail
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier, not approved, or order belongs to another supplier
 *       404:
 *         description: Order not found
 */
router.get("/:id", authenticate, authorize("supplier"), SupplierOrderController.getDetail);

export default router;
