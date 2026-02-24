import { Router } from "express";

import { PayoutController } from "../controllers/payout.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

// ---------------------------------------------------------------------------
// Supplier routes — mounted at /api/suppliers/me/payouts
// ---------------------------------------------------------------------------
export const supplierPayoutRouter = Router();

/**
 * @openapi
 * /suppliers/me/payouts/balance:
 *   get:
 *     summary: Get supplier balance
 *     description: Returns current balance, pending commissions, total paid out, and available for payout.
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Supplier balance details
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
supplierPayoutRouter.get(
  "/balance",
  authenticate,
  authorize("supplier"),
  PayoutController.getBalance,
);

/**
 * @openapi
 * /suppliers/me/payouts/history:
 *   get:
 *     summary: Get payout history
 *     description: Returns paginated payout records for the authenticated supplier, ordered by created_at DESC.
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Paginated payout records
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
supplierPayoutRouter.get(
  "/history",
  authenticate,
  authorize("supplier"),
  PayoutController.getHistory,
);

/**
 * @openapi
 * /suppliers/me/payouts/summary:
 *   get:
 *     summary: Get payout summary
 *     description: Returns current/last month earnings, next payout date, and minimum threshold status.
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payout summary
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
supplierPayoutRouter.get(
  "/summary",
  authenticate,
  authorize("supplier"),
  PayoutController.getSummary,
);

/**
 * @openapi
 * /suppliers/me/payouts/report:
 *   get:
 *     summary: Generate payout report
 *     description: Returns a structured payout report for a date range, with commissions grouped by order and line items.
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period start date (ISO format)
 *       - in: query
 *         name: end
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period end date (ISO format)
 *     responses:
 *       200:
 *         description: Payout report with orders, items, and summary
 *       400:
 *         description: Missing start or end date
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier or supplier not approved
 */
supplierPayoutRouter.get(
  "/report",
  authenticate,
  authorize("supplier"),
  PayoutController.generateReport,
);

// ---------------------------------------------------------------------------
// Admin routes — mounted at /api/admin/payouts
// ---------------------------------------------------------------------------
export const adminPayoutRouter = Router();

/**
 * @openapi
 * /admin/payouts:
 *   post:
 *     summary: Record a payout
 *     description: Admin endpoint to record a payout for a supplier. Deducts amount from supplier balance.
 *     tags: [Admin Payouts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [supplierId, amount, periodStart, periodEnd, commissionTotal, itemsCount]
 *             properties:
 *               supplierId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 type: number
 *               periodStart:
 *                 type: string
 *               periodEnd:
 *                 type: string
 *               commissionTotal:
 *                 type: number
 *               itemsCount:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Payout record created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not an admin
 *       409:
 *         description: Insufficient balance
 */
adminPayoutRouter.post("/", authenticate, authorize("admin"), PayoutController.createPayout);
