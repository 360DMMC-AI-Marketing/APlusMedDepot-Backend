import { Router } from "express";

import { PayPalController } from "../controllers/paypal.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /payments/paypal/create-order:
 *   post:
 *     summary: Create a PayPal order for payment
 *     tags: [Payments - PayPal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: PayPal order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paypalOrderId:
 *                   type: string
 *                 approvalUrl:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer or not the order owner
 *       404:
 *         description: Order not found
 *       409:
 *         description: Order not awaiting payment or payment already initiated
 *       503:
 *         description: PayPal not configured
 */
router.post("/create-order", authenticate, authorize("customer"), PayPalController.createOrder);

/**
 * @openapi
 * /payments/paypal/capture:
 *   post:
 *     summary: Capture a PayPal payment after buyer approval
 *     tags: [Payments - PayPal]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Payment capture result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: string
 *                 status:
 *                   type: string
 *                 paidAt:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: No PayPal payment initiated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer or not the order owner
 *       404:
 *         description: Order not found
 */
router.post("/capture", authenticate, authorize("customer"), PayPalController.captureOrder);

export default router;
