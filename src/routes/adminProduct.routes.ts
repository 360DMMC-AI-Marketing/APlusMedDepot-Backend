import { Router } from "express";

import { AdminProductController } from "../controllers/adminProduct.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));

router.get("/pending", AdminProductController.listPending);

router.get("/:id/review", AdminProductController.getReviewDetail);

router.put("/:id/approve", AdminProductController.approve);

router.put("/:id/request-changes", AdminProductController.requestChanges);

router.put("/:id/reject", AdminProductController.reject);

export default router;
