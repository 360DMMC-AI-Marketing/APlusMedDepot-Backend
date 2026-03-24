import { Router } from "express";

import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { BulkImportController } from "../controllers/bulkImport.controller";

const router = Router();

/**
 * @openapi
 * /suppliers/products/bulk-import:
 *   post:
 *     summary: Bulk import products
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [products]
 *             properties:
 *               products:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 100
 *                 items:
 *                   type: object
 *                   required: [name, sku, price, stockQuantity, category]
 *                   properties:
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     sku:
 *                       type: string
 *                     price:
 *                       type: number
 *                     originalPrice:
 *                       type: number
 *                       nullable: true
 *                     stockQuantity:
 *                       type: number
 *                     category:
 *                       type: string
 *                     specifications:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *     responses:
 *       200:
 *         description: Import results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 imported:
 *                   type: number
 *                 failed:
 *                   type: number
 *                 total:
 *                   type: number
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       row:
 *                         type: number
 *                       sku:
 *                         type: string
 *                       reason:
 *                         type: string
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Not an approved supplier
 */
router.post("/", authenticate, authorize("supplier"), BulkImportController.importProducts);

export default router;
