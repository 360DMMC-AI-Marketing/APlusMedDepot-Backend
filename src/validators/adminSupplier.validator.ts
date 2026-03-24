import { z } from "zod";

export const approvalSchema = z.object({
  commissionRate: z.number().min(1).max(50).optional(),
});

export type ApprovalInput = z.infer<typeof approvalSchema>;

export const rejectionSchema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required").max(1000),
});

export type RejectionInput = z.infer<typeof rejectionSchema>;

export const listSuppliersQuerySchema = z.object({
  status: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type ListSuppliersQueryInput = z.infer<typeof listSuppliersQuerySchema>;

export const commissionQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type CommissionQueryInput = z.infer<typeof commissionQuerySchema>;

export const uuidParamSchema = z.string().uuid();
