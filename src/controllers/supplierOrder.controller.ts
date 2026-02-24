import { Request, Response } from "express";
import { z } from "zod";

import { SupplierOrderService } from "../services/supplierOrder.service";
import { SupplierProductService } from "../services/supplierProduct.service";

const orderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const uuidParamSchema = z.string().uuid("Invalid ID format");

const updateFulfillmentSchema = z
  .object({
    fulfillmentStatus: z.enum(["processing", "shipped", "delivered"]),
    trackingNumber: z.string().min(1, "Tracking number is required").optional(),
    carrier: z.enum(["USPS", "UPS", "FedEx", "DHL", "Other"]).optional(),
  })
  .refine(
    (data) => {
      if (data.fulfillmentStatus === "shipped") {
        return !!data.trackingNumber && !!data.carrier;
      }
      return true;
    },
    {
      message: "trackingNumber and carrier are required when shipping",
      path: ["trackingNumber"],
    },
  );

export class SupplierOrderController {
  /** GET /api/suppliers/me/orders — list supplier's sub-orders */
  static async list(req: Request, res: Response): Promise<void> {
    const query = orderListQuerySchema.parse(req.query);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const result = await SupplierOrderService.getSupplierOrders(supplierId, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    res.status(200).json(result);
  }

  /** GET /api/suppliers/me/orders/stats — order stats */
  static async getStats(req: Request, res: Response): Promise<void> {
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const stats = await SupplierOrderService.getSupplierOrderStats(supplierId);

    res.status(200).json(stats);
  }

  /** GET /api/suppliers/me/orders/:id — order detail */
  static async getDetail(req: Request, res: Response): Promise<void> {
    const subOrderId = uuidParamSchema.parse(req.params.id);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    const detail = await SupplierOrderService.getSupplierOrderDetail(supplierId, subOrderId);

    res.status(200).json(detail);
  }

  /** PUT /api/suppliers/me/orders/items/:itemId/fulfillment — update fulfillment status */
  static async updateFulfillment(req: Request, res: Response): Promise<void> {
    const itemId = uuidParamSchema.parse(req.params.itemId);
    const validated = updateFulfillmentSchema.parse(req.body);
    const supplierId = await SupplierProductService.getSupplierIdFromUserId(req.user!.id);

    await SupplierOrderService.updateItemFulfillment(supplierId, itemId, {
      fulfillmentStatus: validated.fulfillmentStatus,
      trackingNumber: validated.trackingNumber,
      carrier: validated.carrier,
    });

    res.status(200).json({ message: "Fulfillment status updated" });
  }
}
