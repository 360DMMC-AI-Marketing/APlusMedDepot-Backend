import { supabaseAdmin } from "../config/supabase";
import { notFound, badRequest, AppError } from "../utils/errors";
import type {
  ListSuppliersQueryInput,
  CommissionQueryInput,
} from "../validators/adminSupplier.validator";
import { SupplierEmailService } from "./supplierEmail.service";

type SupplierRow = {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string | null;
  tax_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  address: Record<string, string> | null;
  bank_account_info: Record<string, string> | null;
  product_categories: string[] | null;
  commission_rate: number;
  status: string;
  rejection_reason: string | null;
  current_balance: number;
  years_in_business: number | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

type SupplierDocumentRow = {
  id: string;
  supplier_id: string;
  document_type: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  status: string;
  rejection_reason: string | null;
  review_notes: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  updated_at: string;
};

type CommissionRow = {
  id: string;
  order_item_id: string;
  supplier_id: string;
  sale_amount: string;
  commission_rate: number;
  commission_amount: string;
  platform_amount: string;
  supplier_payout: string;
  supplier_amount: string | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

const SUPPLIER_SELECT_FIELDS =
  "id, user_id, business_name, business_type, tax_id, contact_name, contact_email, phone, address, bank_account_info, product_categories, commission_rate, status, rejection_reason, current_balance, years_in_business, approved_at, approved_by, created_at, updated_at";

const DOCUMENT_SELECT_FIELDS =
  "id, supplier_id, document_type, file_name, file_size, mime_type, storage_path, status, rejection_reason, review_notes, uploaded_at, reviewed_at, updated_at";

const COMMISSION_SELECT_FIELDS =
  "id, order_item_id, supplier_id, sale_amount, commission_rate, commission_amount, platform_amount, supplier_payout, supplier_amount, status, confirmed_at, created_at, updated_at";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["under_review"],
  under_review: ["approved", "rejected", "needs_revision"],
  needs_revision: ["under_review"],
  approved: ["suspended"],
  suspended: ["approved"],
  rejected: [],
};

const toSupplier = (row: SupplierRow) => ({
  id: row.id,
  userId: row.user_id,
  businessName: row.business_name,
  businessType: row.business_type,
  taxId: row.tax_id,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  phone: row.phone,
  address: row.address,
  bankAccountInfo: row.bank_account_info,
  productCategories: row.product_categories,
  commissionRate: row.commission_rate,
  status: row.status,
  rejectionReason: row.rejection_reason,
  currentBalance: row.current_balance,
  yearsInBusiness: row.years_in_business,
  approvedAt: row.approved_at,
  approvedBy: row.approved_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toDocument = (row: SupplierDocumentRow) => ({
  id: row.id,
  supplierId: row.supplier_id,
  documentType: row.document_type,
  fileName: row.file_name,
  fileSize: row.file_size,
  mimeType: row.mime_type,
  storagePath: row.storage_path,
  status: row.status,
  rejectionReason: row.rejection_reason,
  reviewNotes: row.review_notes,
  uploadedAt: row.uploaded_at,
  reviewedAt: row.reviewed_at,
  updatedAt: row.updated_at,
});

const toCommission = (row: CommissionRow) => ({
  id: row.id,
  orderItemId: row.order_item_id,
  supplierId: row.supplier_id,
  saleAmount: Number(row.sale_amount),
  commissionRate: row.commission_rate,
  commissionAmount: Number(row.commission_amount),
  platformAmount: Number(row.platform_amount),
  supplierPayout: Number(row.supplier_payout),
  supplierAmount: row.supplier_amount ? Number(row.supplier_amount) : null,
  status: row.status,
  confirmedAt: row.confirmed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class AdminSupplierService {
  static async listSuppliers(query: ListSuppliersQueryInput) {
    const { page, limit, status, search } = query;

    let q = supabaseAdmin.from("suppliers").select(SUPPLIER_SELECT_FIELDS, { count: "exact" });

    if (status) {
      q = q.eq("status", status);
    }

    if (search) {
      q = q.ilike("business_name", `%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await q;

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const total = count ?? 0;
    const suppliers = ((data as unknown as SupplierRow[] | null) ?? []).map(toSupplier);

    return {
      data: suppliers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getSupplierDetail(supplierId: string) {
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select(SUPPLIER_SELECT_FIELDS)
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw notFound("Supplier");
    }

    const { data: documentsData, error: documentsError } = await supabaseAdmin
      .from("supplier_documents")
      .select(DOCUMENT_SELECT_FIELDS)
      .eq("supplier_id", supplierId);

    if (documentsError) {
      throw new AppError(documentsError.message, 500, "DATABASE_ERROR");
    }

    const supplier = toSupplier(supplierData as unknown as SupplierRow);
    const documents = ((documentsData as unknown as SupplierDocumentRow[] | null) ?? []).map(
      toDocument,
    );

    return {
      ...supplier,
      documents,
    };
  }

  static async updateSupplierStatus(
    supplierId: string,
    newStatus: string,
    options?: { commissionRate?: number; rejectionReason?: string },
  ) {
    // Fetch current supplier
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from("suppliers")
      .select("id, status")
      .eq("id", supplierId)
      .single();

    if (fetchError || !currentData) {
      throw notFound("Supplier");
    }

    const current = currentData as { id: string; status: string };
    const currentStatus = current.status;

    // Validate transition
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw badRequest(`Cannot transition from ${currentStatus} to ${newStatus}`);
    }

    // Build update object based on new status
    const updateData: Record<string, unknown> = { status: newStatus };

    if (newStatus === "approved") {
      updateData.commission_rate = options?.commissionRate || 15;
      updateData.approved_at = new Date().toISOString();
    }

    if (newStatus === "rejected") {
      if (!options?.rejectionReason) {
        throw badRequest("Rejection reason is required");
      }
      updateData.rejection_reason = options.rejectionReason;
    }

    // Update supplier
    const { data, error } = await supabaseAdmin
      .from("suppliers")
      .update(updateData)
      .eq("id", supplierId)
      .select(SUPPLIER_SELECT_FIELDS)
      .single();

    if (error || !data) {
      throw new AppError(error?.message ?? "Supplier update failed", 500, "DATABASE_ERROR");
    }

    const supplierRow = data as unknown as SupplierRow;

    // Sync users table status with supplier status
    if (supplierRow.user_id) {
      const userStatus =
        newStatus === "approved" ? "approved" : newStatus === "suspended" ? "suspended" : "pending";
      await supabaseAdmin
        .from("users")
        .update({ status: userStatus, updated_at: new Date().toISOString() })
        .eq("id", supplierRow.user_id);
    }

    // Send email notification based on new status (fire-and-forget)
    if (supplierRow.contact_email) {
      const email = supplierRow.contact_email;
      const businessName = supplierRow.business_name;

      switch (newStatus) {
        case "under_review":
          SupplierEmailService.sendApplicationUnderReview(email, businessName).catch(() => {});
          break;
        case "approved":
          SupplierEmailService.sendApplicationApproved(
            email,
            businessName,
            supplierRow.commission_rate,
          ).catch(() => {});
          break;
        case "rejected":
          if (supplierRow.rejection_reason) {
            SupplierEmailService.sendApplicationRejected(
              email,
              businessName,
              supplierRow.rejection_reason,
            ).catch(() => {});
          }
          break;
        case "needs_revision":
          SupplierEmailService.sendRevisionRequested(email, businessName).catch(() => {});
          break;
        case "suspended":
          SupplierEmailService.sendAccountSuspended(email, businessName).catch(() => {});
          break;
      }
    }

    return toSupplier(supplierRow);
  }

  static async getCommissionReport(query: CommissionQueryInput) {
    const { page, limit, supplierId, startDate, endDate } = query;

    let q = supabaseAdmin.from("commissions").select(COMMISSION_SELECT_FIELDS, { count: "exact" });

    if (supplierId) {
      q = q.eq("supplier_id", supplierId);
    }

    if (startDate) {
      q = q.gte("created_at", startDate);
    }

    if (endDate) {
      q = q.lte("created_at", endDate);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    q = q.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await q;

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    // Calculate aggregates
    let aggregateQuery = supabaseAdmin
      .from("commissions")
      .select("sale_amount, commission_amount, supplier_amount");

    if (supplierId) {
      aggregateQuery = aggregateQuery.eq("supplier_id", supplierId);
    }

    if (startDate) {
      aggregateQuery = aggregateQuery.gte("created_at", startDate);
    }

    if (endDate) {
      aggregateQuery = aggregateQuery.lte("created_at", endDate);
    }

    const { data: allData, error: aggError } = await aggregateQuery;

    if (aggError) {
      throw new AppError(aggError.message, 500, "DATABASE_ERROR");
    }

    const allCommissions = (allData as unknown as CommissionRow[] | null) ?? [];
    const aggregates = {
      totalSaleAmount: allCommissions.reduce((sum, row) => sum + Number(row.sale_amount || 0), 0),
      totalCommissionAmount: allCommissions.reduce(
        (sum, row) => sum + Number(row.commission_amount || 0),
        0,
      ),
      totalSupplierAmount: allCommissions.reduce(
        (sum, row) => sum + Number(row.supplier_amount || 0),
        0,
      ),
    };

    const total = count ?? 0;
    const commissions = ((data as unknown as CommissionRow[] | null) ?? []).map(toCommission);

    return {
      data: commissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      aggregates,
    };
  }
}
