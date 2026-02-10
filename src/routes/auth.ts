import { Router, Request, Response } from "express";

const router = Router();

router.post("/register", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Register a new user" });
});

router.post("/login", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Authenticate user and return JWT" });
});

router.post("/logout", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Invalidate user session" });
});

router.post("/refresh", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Refresh access token" });
});

router.post("/forgot-password", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Send password reset email" });
});

router.post("/reset-password", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Reset user password with token" });
});

export default router;
