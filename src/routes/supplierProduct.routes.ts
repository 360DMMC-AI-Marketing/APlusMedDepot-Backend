import { Router } from "express";

import { SupplierProductController } from "../controllers/supplierProduct.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { uploadSingle } from "../middleware/upload";

const router = Router();

/**
 * @openapi
 * /suppliers/products:
 *   get:
 *     summary: List supplier's own products
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [all, pending, active, inactive, rejected, needs_revision] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of supplier's products
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier role required
 */
router.get("/", authenticate, authorize("supplier"), SupplierProductController.list);

/**
 * @openapi
 * /suppliers/products:
 *   post:
 *     summary: Create a new product listing
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, sku, price, stock_quantity]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               sku: { type: string }
 *               price: { type: number }
 *               stock_quantity: { type: integer }
 *               category: { type: string }
 *               specifications: { type: object }
 *               weight: { type: number }
 *               dimensions: { type: object }
 *     responses:
 *       201:
 *         description: Product created with status pending
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - supplier must be approved
 *       409:
 *         description: SKU already exists for this supplier
 */
router.post("/", authenticate, authorize("supplier"), SupplierProductController.create);

/**
 * @openapi
 * /suppliers/products/{id}:
 *   put:
 *     summary: Update a product listing
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Product updated
 *       400:
 *         description: Validation error or restricted field for active product
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not product owner
 *       404:
 *         description: Product not found
 *       409:
 *         description: SKU already exists for this supplier
 */
router.put("/:id", authenticate, authorize("supplier"), SupplierProductController.update);

/**
 * @openapi
 * /suppliers/products/{id}:
 *   delete:
 *     summary: Soft delete a product listing
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Product deleted
 *       400:
 *         description: Cannot delete product with open orders
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not product owner
 *       404:
 *         description: Product not found
 */
router.delete("/:id", authenticate, authorize("supplier"), SupplierProductController.softDelete);

/**
 * @openapi
 * /suppliers/products/{id}/images:
 *   post:
 *     summary: Upload an image for a supplier product
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG, PNG, WebP). Max 5MB.
 *     responses:
 *       201:
 *         description: Image uploaded, returns updated product
 *       400:
 *         description: Invalid file type, file too large, or already 5 images
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not product owner
 *       404:
 *         description: Product not found
 */
router.post(
  "/:id/images",
  authenticate,
  authorize("supplier"),
  uploadSingle,
  SupplierProductController.uploadImage,
);

/**
 * @openapi
 * /suppliers/products/{id}/images/{imageIndex}:
 *   delete:
 *     summary: Delete an image from a supplier product
 *     tags: [Supplier Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: imageIndex
 *         required: true
 *         schema: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: Image deleted, returns updated product
 *       400:
 *         description: Image index out of range
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - not product owner
 *       404:
 *         description: Product not found
 */
router.delete(
  "/:id/images/:imageIndex",
  authenticate,
  authorize("supplier"),
  SupplierProductController.deleteImage,
);

export default router;
