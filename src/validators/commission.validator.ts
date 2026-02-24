import { z } from "zod";

export const commissionQuerySchema = z.object({
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["pending", "confirmed", "paid", "cancelled", "reversed"]).optional(),
});

export type CommissionQueryInput = z.infer<typeof commissionQuerySchema>;

export const uuidParamSchema = z.string().uuid("Invalid ID format");
