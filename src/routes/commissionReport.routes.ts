import { Router } from "express";

import { CommissionReportController } from "../controllers/commissionReport.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

router.use(authenticate);
router.use(authorize("admin"));

/**
 * @openapi
 * /admin/commissions/earnings:
 *   get:
 *     summary: Platform commission earnings
 *     tags: [Admin Commissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
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
 *         description: Platform earnings with trend data
 */
router.get("/earnings", CommissionReportController.getPlatformEarnings);

/**
 * @openapi
 * /admin/commissions/by-supplier:
 *   get:
 *     summary: Commission report by supplier
 *     tags: [Admin Commissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
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
 *         description: Paginated supplier commission report
 */
router.get("/by-supplier", CommissionReportController.getBySupplier);

/**
 * @openapi
 * /admin/commissions/trend:
 *   get:
 *     summary: Commission trend over time
 *     tags: [Admin Commissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly]
 *           default: weekly
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
 *         description: Array of commission trend data points
 */
router.get("/trend", CommissionReportController.getTrend);

export default router;
