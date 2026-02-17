import { Router } from "express";

import { CheckoutController } from "../controllers/checkout.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /checkout/validate:
 *   post:
 *     summary: Validate cart and return order preview before payment
 *     tags: [Checkout]
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
 *     responses:
 *       200:
 *         description: Validation result (valid or invalid with errors)
 *       400:
 *         description: Malformed request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.post("/validate", authenticate, authorize("customer"), CheckoutController.validate);

export default router;
