import { Router, Request, Response } from "express";

const router = Router();

router.get("/users", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all users (admin only)" });
});

router.put("/users/:id/role", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update user role (admin only)" });
});

router.put("/users/:id/status", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Enable/disable user account (admin only)" });
});

router.get("/orders", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List all orders (admin only)" });
});

router.get("/suppliers/pending", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List pending supplier applications (admin only)" });
});

router.put("/suppliers/:id/approve", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Approve supplier application (admin only)" });
});

router.get("/analytics", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get platform-wide analytics (admin only)" });
});

export default router;
