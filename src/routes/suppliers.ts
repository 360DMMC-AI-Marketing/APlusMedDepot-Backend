import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all suppliers" });
});

router.get("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get supplier profile by ID" });
});

router.put("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update supplier profile" });
});

router.get("/:id/products", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List products by supplier" });
});

router.get("/:id/orders", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List orders for a supplier" });
});

router.get("/:id/analytics", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get supplier analytics/dashboard data" });
});

export default router;
