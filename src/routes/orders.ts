import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List user's orders with pagination" });
});

router.get("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get order details by ID" });
});

router.post("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Create a new order from cart" });
});

router.put("/:id/status", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update order status (supplier/admin)" });
});

router.post("/:id/cancel", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Cancel an order" });
});

export default router;
