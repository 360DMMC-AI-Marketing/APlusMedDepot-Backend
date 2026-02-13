import { Router } from "express";

import { AdminSupplierController } from "../controllers/adminSupplier.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));

/**
 * @openapi
 * /admin/suppliers:
 *   get:
 *     summary: List all suppliers with filtering and pagination
 *     tags: [Admin - Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, under_review, approved, rejected, needs_revision, suspended]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by business name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: List of suppliers
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.get("/", AdminSupplierController.list);

/**
 * @openapi
 * /admin/suppliers/commissions:
 *   get:
 *     summary: Get commission report with aggregates
 *     tags: [Admin - Suppliers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *     responses:
 *       200:
 *         description: Commission report with aggregates
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.get("/commissions", AdminSupplierController.getCommissions);

/**
 * @openapi
 * /admin/suppliers/{id}:
 *   get:
 *     summary: Get supplier details including documents
 *     tags: [Admin - Suppliers]
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
 *         description: Supplier details with documents
 *       404:
 *         description: Supplier not found
 */
router.get("/:id", AdminSupplierController.getDetail);

/**
 * @openapi
 * /admin/suppliers/{id}/approve:
 *   put:
 *     summary: Approve supplier application
 *     tags: [Admin - Suppliers]
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               commissionRate:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 50
 *                 description: Optional custom commission rate (default 15%)
 *     responses:
 *       200:
 *         description: Supplier approved
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Supplier not found
 */
router.put("/:id/approve", AdminSupplierController.approve);

/**
 * @openapi
 * /admin/suppliers/{id}/reject:
 *   put:
 *     summary: Reject supplier application
 *     tags: [Admin - Suppliers]
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
 *             required:
 *               - rejectionReason
 *             properties:
 *               rejectionReason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Supplier rejected
 *       400:
 *         description: Invalid status transition or missing rejection reason
 *       404:
 *         description: Supplier not found
 */
router.put("/:id/reject", AdminSupplierController.reject);

/**
 * @openapi
 * /admin/suppliers/{id}/request-revision:
 *   put:
 *     summary: Request revision on supplier application
 *     tags: [Admin - Suppliers]
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
 *         description: Revision requested
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Supplier not found
 */
router.put("/:id/request-revision", AdminSupplierController.requestRevision);

/**
 * @openapi
 * /admin/suppliers/{id}/review:
 *   put:
 *     summary: Move supplier from pending to under review
 *     tags: [Admin - Suppliers]
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
 *         description: Supplier moved to under review
 *       400:
 *         description: Invalid status transition
 *       404:
 *         description: Supplier not found
 */
router.put("/:id/review", AdminSupplierController.startReview);

export default router;
