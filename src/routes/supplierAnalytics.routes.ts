import { Router } from "express";

import { SupplierAnalyticsController } from "../controllers/supplierAnalytics.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

router.get(
  "/products",
  authenticate,
  authorize("supplier"),
  SupplierAnalyticsController.getAggregateAnalytics,
);

/**
 * @openapi
 * /suppliers/analytics/dashboard:
 *   get:
 *     summary: Supplier dashboard stats
 *     description: Revenue month-over-month, order counts, average order value, active products
 *     tags: [Supplier Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier
 */
router.get(
  "/dashboard",
  authenticate,
  authorize("supplier"),
  SupplierAnalyticsController.getDashboardStats,
);

/**
 * @openapi
 * /suppliers/analytics/top-products:
 *   get:
 *     summary: Top products by revenue
 *     description: Returns top N products ordered by total revenue descending
 *     tags: [Supplier Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 20
 *           default: 5
 *     responses:
 *       200:
 *         description: Top products list
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier
 */
router.get(
  "/top-products",
  authenticate,
  authorize("supplier"),
  SupplierAnalyticsController.getTopProducts,
);

/**
 * @openapi
 * /suppliers/analytics/revenue-trend:
 *   get:
 *     summary: Revenue trend over time
 *     description: Revenue grouped by time buckets (daily for week/month, weekly for 3months)
 *     tags: [Supplier Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, 3months]
 *           default: month
 *     responses:
 *       200:
 *         description: Revenue trend data points
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier
 */
router.get(
  "/revenue-trend",
  authenticate,
  authorize("supplier"),
  SupplierAnalyticsController.getRevenueTrend,
);

/**
 * @openapi
 * /suppliers/analytics/order-status:
 *   get:
 *     summary: Order status breakdown
 *     description: Count of supplier orders grouped by status bucket
 *     tags: [Supplier Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order status counts
 *       401:
 *         description: Missing or invalid auth token
 *       403:
 *         description: Not a supplier
 */
router.get(
  "/order-status",
  authenticate,
  authorize("supplier"),
  SupplierAnalyticsController.getOrderStatusBreakdown,
);

export default router;
