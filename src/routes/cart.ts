import { Router } from "express";

import { CartController } from "../controllers/cart.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /cart:
 *   get:
 *     summary: Get current customer's cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart with items and totals
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.get("/", authenticate, authorize("customer"), CartController.getCart);

/**
 * @openapi
 * /cart/validate:
 *   get:
 *     summary: Validate cart items against current product state
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation result with any issues found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.get("/validate", authenticate, authorize("customer"), CartController.validateCart);

/**
 * @openapi
 * /cart/refresh:
 *   post:
 *     summary: Auto-fix all stale cart items
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Refreshed cart with list of changes made
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.post("/refresh", authenticate, authorize("customer"), CartController.refreshCart);

/**
 * @openapi
 * /cart/items:
 *   post:
 *     summary: Add item to cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId, quantity]
 *             properties:
 *               productId:
 *                 type: string
 *                 format: uuid
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: Item added to cart
 *       400:
 *         description: Validation error, out of stock, or product unavailable
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 *       404:
 *         description: Product not found
 */
router.post("/items", authenticate, authorize("customer"), CartController.addItem);

/**
 * @openapi
 * /cart/items/{id}:
 *   put:
 *     summary: Update cart item quantity
 *     tags: [Cart]
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
 *             required: [quantity]
 *             properties:
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Cart item updated
 *       400:
 *         description: Validation error or insufficient stock
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer or not item owner
 *       404:
 *         description: Cart item not found
 */
router.put("/items/:id", authenticate, authorize("customer"), CartController.updateItem);

/**
 * @openapi
 * /cart/items/{id}:
 *   delete:
 *     summary: Remove item from cart
 *     tags: [Cart]
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
 *         description: Item removed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer or not item owner
 *       404:
 *         description: Cart item not found
 */
router.delete("/items/:id", authenticate, authorize("customer"), CartController.removeItem);

/**
 * @openapi
 * /cart:
 *   delete:
 *     summary: Clear entire cart
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared — returns empty cart structure
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — not a customer
 */
router.delete("/", authenticate, authorize("customer"), CartController.clearCart);

export default router;
