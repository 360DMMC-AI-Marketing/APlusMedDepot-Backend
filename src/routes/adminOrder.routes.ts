import { Router } from "express";

import { AdminOrderController } from "../controllers/adminOrder.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));

router.get("/", AdminOrderController.list);

router.get("/search", AdminOrderController.search);

router.get("/status-counts", AdminOrderController.getStatusCounts);

router.get("/:id", AdminOrderController.getDetail);

export default router;
