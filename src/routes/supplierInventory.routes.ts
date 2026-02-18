import { Router } from "express";

import { SupplierInventoryController } from "../controllers/supplierInventory.controller";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/rbac";

const router = Router();

router.get("/low-stock", authenticate, authorize("supplier"), SupplierInventoryController.lowStock);

router.get("/", authenticate, authorize("supplier"), SupplierInventoryController.list);

router.put(
  "/:productId",
  authenticate,
  authorize("supplier"),
  SupplierInventoryController.updateStock,
);

router.post(
  "/bulk-update",
  authenticate,
  authorize("supplier"),
  SupplierInventoryController.bulkUpdate,
);

export default router;
