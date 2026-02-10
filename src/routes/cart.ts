import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get current user's cart" });
});

router.post("/items", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Add item to cart" });
});

router.put("/items/:itemId", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update cart item quantity" });
});

router.delete("/items/:itemId", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Remove item from cart" });
});

router.delete("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Clear entire cart" });
});

export default router;
