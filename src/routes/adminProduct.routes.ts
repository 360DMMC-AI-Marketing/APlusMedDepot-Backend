import { Router } from "express";

import { AdminProductController } from "../controllers/adminProduct.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { withAuditContext } from "../middleware/auditMiddleware";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));
router.use(withAuditContext);

/**
 * @openapi
 * /admin/products:
 *   get:
 *     tags: [Admin - Products]
 *     summary: List all products
 *     description: Returns a paginated list of all products with filtering. Admin only.
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
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated product list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/", AdminProductController.list);

/**
 * @openapi
 * /admin/products/pending:
 *   get:
 *     tags: [Admin - Products]
 *     summary: List pending products
 *     description: Returns paginated list of products awaiting admin approval. Admin only.
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
 *     responses:
 *       200:
 *         description: Pending products list
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 */
router.get("/pending", AdminProductController.listPending);

/**
 * @openapi
 * /admin/products/{id}:
 *   get:
 *     tags: [Admin - Products]
 *     summary: Get product details
 *     description: Returns full product details including supplier info. Admin only.
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
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.get("/:id", AdminProductController.getDetail);

/**
 * @openapi
 * /admin/products/{id}/review:
 *   get:
 *     tags: [Admin - Products]
 *     summary: Get product review details
 *     description: Returns full product detail with supplier info and review history. Admin only.
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
 *         description: Product review details
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.get("/:id/review", AdminProductController.getReviewDetail);

/**
 * @openapi
 * /admin/products/{id}/approve:
 *   put:
 *     tags: [Admin - Products]
 *     summary: Approve a product
 *     description: Approve a pending product, setting status to active. Sends email notification. Admin only.
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
 *         description: Product approved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.put("/:id/approve", AdminProductController.approve);

/**
 * @openapi
 * /admin/products/{id}/request-changes:
 *   put:
 *     tags: [Admin - Products]
 *     summary: Request changes on a product
 *     description: Request changes on a product, setting status to needs_revision. Sends email with feedback. Admin only.
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
 *               feedback:
 *                 type: string
 *             required:
 *               - feedback
 *     responses:
 *       200:
 *         description: Changes requested
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.put("/:id/request-changes", AdminProductController.requestChanges);

/**
 * @openapi
 * /admin/products/{id}/reject:
 *   put:
 *     tags: [Admin - Products]
 *     summary: Reject a product
 *     description: Reject a product, setting status to rejected. Sends email with reason. Admin only.
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
 *               reason:
 *                 type: string
 *             required:
 *               - reason
 *     responses:
 *       200:
 *         description: Product rejected
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.put("/:id/reject", AdminProductController.reject);

/**
 * @openapi
 * /admin/products/{id}/feature:
 *   put:
 *     tags: [Admin - Products]
 *     summary: Feature a product
 *     description: Mark a product as featured. Admin only.
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
 *         description: Product featured
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.put("/:id/feature", AdminProductController.feature);

/**
 * @openapi
 * /admin/products/{id}/unfeature:
 *   put:
 *     tags: [Admin - Products]
 *     summary: Unfeature a product
 *     description: Remove featured status from a product. Admin only.
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
 *         description: Product unfeatured
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin only
 *       404:
 *         description: Product not found
 */
router.put("/:id/unfeature", AdminProductController.unfeature);

export default router;
