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

router.get("/", AdminProductController.list);

router.get("/pending", AdminProductController.listPending);

router.get("/:id", AdminProductController.getDetail);

router.get("/:id/review", AdminProductController.getReviewDetail);

router.put("/:id/approve", AdminProductController.approve);

router.put("/:id/request-changes", AdminProductController.requestChanges);

router.put("/:id/reject", AdminProductController.reject);

router.put("/:id/feature", AdminProductController.feature);

router.put("/:id/unfeature", AdminProductController.unfeature);

export default router;
