import { Router, Request, Response } from "express";

import { ProductController } from "../controllers/product.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { uploadSingle } from "../middleware/upload";

const router = Router();

/**
 * @openapi
 * /products:
 *   get:
 *     summary: List products with pagination and filters
 *     tags: [Products]
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
 *           default: 20
 *           maximum: 100
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, pending_review, active, inactive, out_of_stock]
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, price, created_at]
 *           default: created_at
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Paginated product list
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, ProductController.list);

/**
 * @openapi
 * /products/search:
 *   get:
 *     summary: Full-text search products
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Missing search query
 *       401:
 *         description: Unauthorized
 */
router.get("/search", authenticate, ProductController.search);

/**
 * @openapi
 * /products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
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
 *         description: Product details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Product not found
 */
router.get("/:id", authenticate, ProductController.getById);

/**
 * @openapi
 * /products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, sku, price, stockQuantity]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 maxLength: 5000
 *               sku:
 *                 type: string
 *                 pattern: '^[a-zA-Z0-9-]+$'
 *               price:
 *                 type: number
 *                 minimum: 0.01
 *               stockQuantity:
 *                 type: integer
 *                 minimum: 0
 *               category:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 maxItems: 5
 *               specifications:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *               weight:
 *                 type: number
 *               dimensions:
 *                 type: object
 *                 properties:
 *                   length:
 *                     type: number
 *                   width:
 *                     type: number
 *                   height:
 *                     type: number
 *               status:
 *                 type: string
 *                 enum: [draft, pending_review, active, inactive, out_of_stock]
 *                 default: draft
 *     responses:
 *       201:
 *         description: Product created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: SKU already exists
 */
router.post("/", authenticate, authorize("supplier", "admin"), ProductController.create);

/**
 * @openapi
 * /products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               sku:
 *                 type: string
 *               price:
 *                 type: number
 *               stockQuantity:
 *                 type: integer
 *               category:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               specifications:
 *                 type: object
 *               weight:
 *                 type: number
 *               dimensions:
 *                 type: object
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Product updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to update this product
 *       404:
 *         description: Product not found
 *       409:
 *         description: SKU already exists
 */
router.put("/:id", authenticate, authorize("supplier", "admin"), ProductController.update);

/**
 * @openapi
 * /products/{id}:
 *   delete:
 *     summary: Soft delete a product
 *     tags: [Products]
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
 *         description: Product deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to delete this product
 *       404:
 *         description: Product not found
 */
router.delete("/:id", authenticate, authorize("supplier", "admin"), ProductController.softDelete);

/**
 * @openapi
 * /products/{id}/images:
 *   post:
 *     summary: Upload a product image
 *     tags: [Products]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Image uploaded
 *       400:
 *         description: Invalid file type, file too large, or max images reached
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to upload images for this product
 *       404:
 *         description: Product not found
 */
router.post(
  "/:id/images",
  authenticate,
  authorize("supplier", "admin"),
  uploadSingle,
  ProductController.uploadImage,
);

/**
 * @openapi
 * /products/{id}/images/{imageIndex}:
 *   delete:
 *     summary: Delete a product image by index
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: imageIndex
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Image deleted
 *       400:
 *         description: Invalid image index
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not authorized to delete images for this product
 *       404:
 *         description: Product not found
 */
router.delete(
  "/:id/images/:imageIndex",
  authenticate,
  authorize("supplier", "admin"),
  ProductController.deleteImage,
);

// Review endpoints — TODO
router.get("/:id/reviews", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get reviews for a product" });
});

router.post("/:id/reviews", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Add a review for a product" });
});

export default router;
