import { Router } from "express";

import { AdminUserController } from "../controllers/adminUser.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";
import { withAuditContext } from "../middleware/auditMiddleware";

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorize("admin"));
router.use(withAuditContext);

router.get("/", AdminUserController.list);

router.get("/pending-count", AdminUserController.getPendingCount);

router.get("/:id", AdminUserController.getDetail);

router.put("/:id/approve", AdminUserController.approve);

router.put("/:id/reject", AdminUserController.reject);

router.put("/:id/suspend", AdminUserController.suspend);

router.put("/:id/reactivate", AdminUserController.reactivate);

export default router;
