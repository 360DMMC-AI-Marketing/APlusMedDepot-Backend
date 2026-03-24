import { Router } from "express";

import { CreditController } from "../controllers/credit.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

/**
 * @openapi
 * /users/me/credit:
 *   get:
 *     summary: Get current user's credit information
 *     tags: [Credit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credit information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 eligible:
 *                   type: boolean
 *                 limit:
 *                   type: number
 *                 used:
 *                   type: number
 *                 available:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/users/me/credit", authenticate, CreditController.getCreditInfo);

/**
 * @openapi
 * /payments/net30:
 *   post:
 *     summary: Place an order using Net30 credit terms
 *     tags: [Payments - Net30]
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
 *         description: Net30 order confirmed with invoice
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: string
 *                 invoiceId:
 *                   type: string
 *                   nullable: true
 *                 invoiceDueDate:
 *                   type: string
 *                 amount:
 *                   type: number
 *                 status:
 *                   type: string
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not eligible for Net30 or insufficient credit
 *       404:
 *         description: Order not found
 *       409:
 *         description: Payment already initiated or order not awaiting payment
 */
router.post("/payments/net30", authenticate, CreditController.placeNet30Order);

export default router;
