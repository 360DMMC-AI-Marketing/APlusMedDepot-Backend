import { Router } from "express";

import { PlatformAnalyticsController } from "../controllers/platformAnalytics.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

/**
 * @openapi
 * /admin/analytics/revenue:
 *   get:
 *     summary: Platform revenue metrics with period comparison
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, quarter, year, all]
 *           default: month
 *     responses:
 *       200:
 *         description: Revenue comparison with current and previous period
 */
router.get("/revenue", PlatformAnalyticsController.getRevenue);

/**
 * @openapi
 * /admin/analytics/revenue/suppliers:
 *   get:
 *     summary: Revenue breakdown by supplier
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
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
 *     responses:
 *       200:
 *         description: List of suppliers with revenue data
 */
router.get("/revenue/suppliers", PlatformAnalyticsController.getRevenueBySupplier);

/**
 * @openapi
 * /admin/analytics/revenue/categories:
 *   get:
 *     summary: Revenue breakdown by product category
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *     responses:
 *       200:
 *         description: List of categories with revenue data
 */
router.get("/revenue/categories", PlatformAnalyticsController.getRevenueByCategory);

/**
 * @openapi
 * /admin/analytics/revenue/trend:
 *   get:
 *     summary: Revenue trend over time
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: daily
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
 *     responses:
 *       200:
 *         description: Array of trend data points
 */
router.get("/revenue/trend", PlatformAnalyticsController.getRevenueTrend);

/**
 * @openapi
 * /admin/analytics/orders:
 *   get:
 *     summary: Order metrics (totals, averages, conversion rate)
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [today, week, month, quarter, year, all]
 *           default: month
 *     responses:
 *       200:
 *         description: Order metrics object
 */
router.get("/orders", PlatformAnalyticsController.getOrderMetrics);

/**
 * @openapi
 * /admin/analytics/top-products:
 *   get:
 *     summary: Top products by revenue
 *     tags: [Admin Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Array of top products
 */
router.get("/top-products", PlatformAnalyticsController.getTopProducts);

export default router;
