import { Router } from "express";

import { OrderController } from "../controllers/order.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Create a new order from the customer's active cart
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [shipping_address]
 *             properties:
 *               shipping_address:
 *                 type: object
 *                 required: [street, city, state, zip_code, country]
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zip_code:
 *                     type: string
 *                     pattern: '^\d{5}(-\d{4})?$'
 *                   country:
 *                     type: string
 *               notes:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error, empty cart, or insufficient stock
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.post("/", authenticate, authorize("customer"), OrderController.create);

/**
 * @openapi
 * /orders:
 *   get:
 *     summary: List customer's orders with pagination
 *     tags: [Orders]
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
 *           default: 10
 *           maximum: 50
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending_payment, payment_processing, payment_confirmed, awaiting_fulfillment, partially_shipped, fully_shipped, delivered, cancelled, refunded]
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [created_at]
 *           default: created_at
 *       - in: query
 *         name: sort_order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated list of customer orders
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.get("/", authenticate, authorize("customer"), OrderController.list);

/**
 * @openapi
 * /orders/{id}/status:
 *   put:
 *     summary: Update an order's status (admin only)
 *     tags: [Orders]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending_payment, payment_processing, payment_confirmed, awaiting_fulfillment, partially_shipped, fully_shipped, delivered, cancelled, refunded]
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status or invalid transition
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not an admin
 *       404:
 *         description: Order not found
 */
router.put("/:id/status", authenticate, authorize("admin"), OrderController.updateStatus);

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get order details with items and status history
 *     tags: [Orders]
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
 *         description: Order with items and status history
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — customer can only view own orders
 *       404:
 *         description: Order not found
 */
router.get("/:id", authenticate, OrderController.getById);

export default router;
