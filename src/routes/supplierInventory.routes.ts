import { Router } from "express";

import { SupplierInventoryController } from "../controllers/supplierInventory.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

/**
 * @openapi
 * /suppliers/inventory/low-stock:
 *   get:
 *     tags: [Suppliers]
 *     summary: Get low-stock products
 *     description: Returns products at or below their low stock threshold. Supplier only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Low stock products list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — supplier only
 */
router.get("/low-stock", authenticate, authorize("supplier"), SupplierInventoryController.lowStock);

/**
 * @openapi
 * /suppliers/inventory:
 *   get:
 *     tags: [Suppliers]
 *     summary: List inventory
 *     description: Returns supplier's full inventory with low-stock summary. Supplier only.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory list with summary
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — supplier only
 */
router.get("/", authenticate, authorize("supplier"), SupplierInventoryController.list);

/**
 * @openapi
 * /suppliers/inventory/{productId}:
 *   put:
 *     tags: [Suppliers]
 *     summary: Update product stock
 *     description: Update stock quantity for a specific product. Uses SELECT FOR UPDATE locking. Supplier only.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
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
 *             properties:
 *               quantity:
 *                 type: integer
 *               reason:
 *                 type: string
 *             required:
 *               - quantity
 *     responses:
 *       200:
 *         description: Stock updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — supplier only
 *       404:
 *         description: Product not found
 */
router.put(
  "/:productId",
  authenticate,
  authorize("supplier"),
  SupplierInventoryController.updateStock,
);

/**
 * @openapi
 * /suppliers/inventory/bulk-update:
 *   post:
 *     tags: [Suppliers]
 *     summary: Bulk update stock
 *     description: Update stock for multiple products at once (max 50). All-or-nothing transaction. Supplier only.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               updates:
 *                 type: array
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *                   required:
 *                     - productId
 *                     - quantity
 *             required:
 *               - updates
 *     responses:
 *       200:
 *         description: All stocks updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — supplier only
 */
router.post(
  "/bulk-update",
  authenticate,
  authorize("supplier"),
  SupplierInventoryController.bulkUpdate,
);

export default router;
