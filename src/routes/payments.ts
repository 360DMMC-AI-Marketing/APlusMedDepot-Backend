import { Router, Request, Response } from "express";

const router = Router();

router.post("/create-intent", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Create Stripe payment intent" });
});

router.post("/webhook", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Handle Stripe webhook events" });
});

router.get("/history", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get user's payment history" });
});

router.post("/refund/:paymentId", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Initiate refund for a payment" });
});

export default router;
