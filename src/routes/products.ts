import { Router, Request, Response } from "express";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all products with pagination and filters" });
});

router.get("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get product details by ID" });
});

router.post("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Create a new product (supplier only)" });
});

router.put("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update product by ID (supplier only)" });
});

router.delete("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Delete product by ID (supplier only)" });
});

router.get("/:id/reviews", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get reviews for a product" });
});

router.post("/:id/reviews", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Add a review for a product" });
});

export default router;
