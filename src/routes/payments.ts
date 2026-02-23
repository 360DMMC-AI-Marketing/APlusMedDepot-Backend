import { Router } from "express";

import { PaymentController } from "../controllers/payment.controller";
import { WebhookController } from "../controllers/webhook.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /payments/intent:
 *   post:
 *     summary: Create a Stripe PaymentIntent for an order
 *     tags: [Payments]
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
 *         description: PaymentIntent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret:
 *                   type: string
 *                 paymentIntentId:
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
 *         description: Order is not awaiting payment or payment already initiated
 */
router.post("/intent", authenticate, authorize("customer"), PaymentController.createPaymentIntent);

/**
 * @openapi
 * /payments/confirm:
 *   post:
 *     summary: Confirm payment for an order after client-side completion
 *     tags: [Payments]
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
 *         description: Payment confirmation result
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
 *       400:
 *         description: No payment initiated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer or not the order owner
 *       404:
 *         description: Order not found
 */
router.post("/confirm", authenticate, authorize("customer"), PaymentController.confirmPayment);

/**
 * @openapi
 * /payments/{orderId}/status:
 *   get:
 *     summary: Get payment and order status for an order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Payment and order status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentStatus:
 *                   type: string
 *                 orderStatus:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer or not the order owner
 *       404:
 *         description: Order not found
 */
router.get(
  "/:orderId/status",
  authenticate,
  authorize("customer"),
  PaymentController.getPaymentStatus,
);

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     summary: Stripe webhook endpoint (called by Stripe, not by clients)
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 *       400:
 *         description: Invalid signature or missing header
 */
router.post("/webhook", WebhookController.handleWebhook);

export default router;
