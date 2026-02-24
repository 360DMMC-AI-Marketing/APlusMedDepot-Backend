import { Router } from "express";

import { CommissionController } from "../controllers/commission.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

// ---------------------------------------------------------------------------
// Supplier routes — /api/suppliers/commissions
// ---------------------------------------------------------------------------

/**
 * @openapi
 * /suppliers/commissions:
 *   get:
 *     summary: List own commissions
 *     description: Returns all commission records for the authenticated supplier, with optional date and status filters.
 *     tags: [Commissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter commissions created on or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter commissions created on or before this date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, paid, cancelled, reversed]
 *         description: Filter by commission status
 *     responses:
 *       200:
 *         description: List of commission records
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
router.get("/", authenticate, authorize("supplier"), CommissionController.getMyCommissions);

/**
 * @openapi
 * /suppliers/commissions/summary:
 *   get:
 *     summary: Commission summary
 *     description: Returns aggregated totals (sales, commission, payout, balance, order count) for the authenticated supplier.
 *     tags: [Commissions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Commission summary object
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
router.get(
  "/summary",
  authenticate,
  authorize("supplier"),
  CommissionController.getCommissionSummary,
);

/**
 * @openapi
 * /admin/commissions/order/{orderId}:
 *   get:
 *     summary: View commissions for an order
 *     description: Admin endpoint to view all commission records for a specific order.
 *     tags: [Admin Commissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The order ID
 *     responses:
 *       200:
 *         description: List of commission records for the order
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not an admin
 */
router.get(
  "/order/:orderId",
  authenticate,
  authorize("admin"),
  CommissionController.getOrderCommissions,
);

/**
 * @openapi
 * /admin/commissions/supplier/{supplierId}:
 *   get:
 *     summary: View commissions for a supplier
 *     description: Admin endpoint to view all commission records for a specific supplier, with optional date and status filters.
 *     tags: [Admin Commissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: supplierId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The supplier ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter commissions created on or after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter commissions created on or before this date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, paid, cancelled, reversed]
 *         description: Filter by commission status
 *     responses:
 *       200:
 *         description: List of commission records for the supplier
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not an admin
 */
router.get(
  "/supplier/:supplierId",
  authenticate,
  authorize("admin"),
  CommissionController.getPlatformCommissions,
);

export default router;
