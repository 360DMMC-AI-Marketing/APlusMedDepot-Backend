import { Router, Request, Response } from "express";

const router = Router();

/**
 * @openapi
 * /orders:
 *   get:
 *     tags: [Orders]
 *     summary: List user's orders (stub)
 *     description: Returns paginated list of user's orders. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated order list
 *       401:
 *         description: Unauthorized
 */
router.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: List user's orders with pagination" });
});

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get order details (stub)
 *     description: Returns order details by ID. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Order details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.get("/:id", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Get order details by ID" });
});

/**
 * @openapi
 * /orders:
 *   post:
 *     tags: [Orders]
 *     summary: Create order from cart (stub)
 *     description: Creates a new order from the user's cart. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order created
 *       401:
 *         description: Unauthorized
 */
router.post("/", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Create a new order from cart" });
});

/**
 * @openapi
 * /orders/{id}/status:
 *   put:
 *     tags: [Orders]
 *     summary: Update order status (stub)
 *     description: Update order status. Supplier/admin only. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Status updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.put("/:id/status", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Update order status (supplier/admin)" });
});

/**
 * @openapi
 * /orders/{id}/cancel:
 *   post:
 *     tags: [Orders]
 *     summary: Cancel an order (stub)
 *     description: Cancel an order. Currently a TODO stub.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Order cancelled
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.post("/:id/cancel", (_req: Request, res: Response) => {
  res.status(200).json({ message: "TODO: Cancel an order" });
});

export default router;
