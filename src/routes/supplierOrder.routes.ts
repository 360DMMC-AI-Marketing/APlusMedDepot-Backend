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

/**
 * @openapi
 * /suppliers/me/orders/items/{itemId}/fulfillment:
 *   put:
 *     summary: Update item fulfillment status
 *     description: Updates the fulfillment status of a specific order item. Validates state transitions and requires tracking info when shipping.
 *     tags: [Supplier Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order item ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fulfillmentStatus]
 *             properties:
 *               fulfillmentStatus:
 *                 type: string
 *                 enum: [processing, shipped, delivered]
 *               trackingNumber:
 *                 type: string
 *                 description: Required when fulfillmentStatus is 'shipped'
 *               carrier:
 *                 type: string
 *                 enum: [USPS, UPS, FedEx, DHL, Other]
 *                 description: Required when fulfillmentStatus is 'shipped'
 *     responses:
 *       200:
 *         description: Fulfillment status updated
 *       400:
 *         description: Validation error (missing tracking info for shipped)
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or item belongs to another supplier
 *       404:
 *         description: Order item not found
 *       409:
 *         description: Invalid status transition
 */
router.put(
  "/items/:itemId/fulfillment",
  authenticate,
  authorize("supplier"),
  SupplierOrderController.updateFulfillment,
);

export default router;
