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

export default router;
