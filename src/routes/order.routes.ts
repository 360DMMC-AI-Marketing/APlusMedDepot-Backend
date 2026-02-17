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

export default router;
