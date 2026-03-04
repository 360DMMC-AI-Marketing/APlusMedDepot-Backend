import { supabaseAdmin } from "../config/supabase";
import { sendEmail } from "./email.service";
import { AuditLogService } from "./auditLog.service";
import { baseLayout, escapeHtml } from "../templates/baseLayout";
import { AppError, notFound, badRequest, conflict } from "../utils/errors";
import { logAdminAction } from "../utils/securityLogger";
import type {
  AdminProductListItem,
  AdminProductDetail,
  PaginatedResult,
} from "../types/admin.types";
import type { AuditContext } from "../middleware/auditMiddleware";

interface ProductRow {
  id: string;
  supplier_id: string;
  name: string;
  description: string | null;
  sku: string;
  price: string;
  stock_quantity: number;
  category: string | null;
  status: string;
  images: string[] | null;
  specifications: Record<string, string> | null;
  weight: string | null;
  dimensions: { length?: number; width?: number; height?: number } | null;
  is_deleted: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_feedback: string | null;
  created_at: string;
  updated_at: string;
}

interface SupplierInfo {
  id: string;
  business_name: string;
  contact_email: string;
}

export interface PendingProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  category: string | null;
  images: string[] | null;
  created_at: string;
  supplier: { id: string; business_name: string };
}

export interface PendingListResponse {
  products: PendingProduct[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface ProductReviewDetail {
  id: string;
  supplier_id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  stock_quantity: number;
  category: string | null;
  status: string;
  images: string[] | null;
  specifications: Record<string, string> | null;
  weight: number | null;
  dimensions: { length?: number; width?: number; height?: number } | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_feedback: string | null;
  created_at: string;
  updated_at: string;
  supplier: { id: string; business_name: string; contact_email: string };
  review_history: Array<{
    action: string;
    admin_feedback: string | null;
    reviewed_at: string | null;
    reviewed_by: string | null;
  }>;
}

export interface ReviewedProduct {
  id: string;
  name: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_feedback: string | null;
}

const PRODUCT_REVIEW_FIELDS =
  "id, supplier_id, name, description, sku, price, stock_quantity, category, status, images, specifications, weight, dimensions, is_deleted, reviewed_by, reviewed_at, admin_feedback, created_at, updated_at";

export class AdminProductService {
  /**
   * GET /api/admin/products/pending
   */
  static async listPending(page: number, limit: number): Promise<PendingListResponse> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from("products")
      .select("id, name, sku, price, category, images, created_at, supplier_id", { count: "exact" })
      .eq("status", "pending")
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    const rows = (data ?? []) as Array<{
      id: string;
      name: string;
      sku: string;
      price: string;
      category: string | null;
      images: string[] | null;
      created_at: string;
      supplier_id: string;
    }>;

    // Fetch supplier info for each unique supplier_id
    const supplierIds = [...new Set(rows.map((r) => r.supplier_id))];
    const supplierMap = new Map<string, { id: string; business_name: string }>();

    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabaseAdmin
        .from("suppliers")
        .select("id, business_name")
        .in("id", supplierIds);

      for (const s of (suppliers ?? []) as Array<{ id: string; business_name: string }>) {
        supplierMap.set(s.id, { id: s.id, business_name: s.business_name });
      }
    }

    const total = count ?? 0;
    const products: PendingProduct[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      price: Number(r.price),
      category: r.category,
      images: r.images,
      created_at: r.created_at,
      supplier: supplierMap.get(r.supplier_id) ?? { id: r.supplier_id, business_name: "Unknown" },
    }));

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * GET /api/admin/products/:id/review
   */
  static async getReviewDetail(productId: string): Promise<ProductReviewDetail> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(PRODUCT_REVIEW_FIELDS)
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }
    if (!data) {
      throw notFound("Product");
    }

    const row = data as unknown as ProductRow;

    // Fetch supplier info
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select("id, business_name, contact_email")
      .eq("id", row.supplier_id)
      .single();

    if (supplierError || !supplierData) {
      throw new AppError("Supplier not found for product", 500, "DATABASE_ERROR");
    }

    const supplier = supplierData as SupplierInfo;

    // Build review_history from the current review state.
    // A simple representation: if reviewed_at is set, there's a review entry.
    const review_history: ProductReviewDetail["review_history"] = [];
    if (row.reviewed_at) {
      review_history.push({
        action:
          row.status === "active"
            ? "approved"
            : row.status === "rejected"
              ? "rejected"
              : "request_changes",
        admin_feedback: row.admin_feedback,
        reviewed_at: row.reviewed_at,
        reviewed_by: row.reviewed_by,
      });
    }

    return {
      id: row.id,
      supplier_id: row.supplier_id,
      name: row.name,
      description: row.description,
      sku: row.sku,
      price: Number(row.price),
      stock_quantity: row.stock_quantity,
      category: row.category,
      status: row.status,
      images: row.images,
      specifications: row.specifications,
      weight: row.weight !== null ? Number(row.weight) : null,
      dimensions: row.dimensions,
      reviewed_by: row.reviewed_by,
      reviewed_at: row.reviewed_at,
      admin_feedback: row.admin_feedback,
      created_at: row.created_at,
      updated_at: row.updated_at,
      supplier: {
        id: supplier.id,
        business_name: supplier.business_name,
        contact_email: supplier.contact_email,
      },
      review_history,
    };
  }

  /**
   * PUT /api/admin/products/:id/approve
   */
  static async approve(
    productId: string,
    adminUserId: string,
    auditCtx?: AuditContext,
  ): Promise<ReviewedProduct> {
    const product = await this.getProductForReview(productId);

    if (
      product.status !== "pending" &&
      product.status !== "rejected" &&
      product.status !== "needs_revision"
    ) {
      throw badRequest(
        `Cannot approve product with status '${product.status}'. Only pending, rejected, or needs_revision products can be approved.`,
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        status: "active",
        reviewed_by: adminUserId,
        reviewed_at: now,
        admin_feedback: null,
      })
      .eq("id", productId)
      .select("id, name, status, reviewed_by, reviewed_at, admin_feedback")
      .single();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    // Send email to supplier
    const supplierEmail = await this.getSupplierEmail(product.supplier_id);
    if (supplierEmail) {
      const html = baseLayout({
        title: "Product Approved",
        preheader: `Your product "${product.name}" has been approved`,
        body: `
          <p>Your product <strong>${escapeHtml(product.name)}</strong> has been approved and is now live on the marketplace.</p>
          <p><strong>SKU:</strong> ${escapeHtml(product.sku)}</p>
          <p>Customers can now find and purchase your product.</p>
        `,
      });
      void sendEmail(supplierEmail, `Product Approved: ${product.name}`, html);
    }

    logAdminAction({
      action: "product_approved",
      adminId: adminUserId,
      targetUserId: product.supplier_id,
      timestamp: now,
    });

    void AuditLogService.log({
      adminId: adminUserId,
      action: "product_approved",
      resourceType: "product",
      resourceId: productId,
      details: { productName: product.name, previousStatus: product.status },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });

    const row = data as {
      id: string;
      name: string;
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      admin_feedback: string | null;
    };
    return row;
  }

  /**
   * PUT /api/admin/products/:id/request-changes
   */
  static async requestChanges(
    productId: string,
    adminUserId: string,
    feedback: string,
    auditCtx?: AuditContext,
  ): Promise<ReviewedProduct> {
    const product = await this.getProductForReview(productId);

    if (product.status !== "pending") {
      throw badRequest(
        `Cannot request changes for product with status '${product.status}'. Only pending products can receive change requests.`,
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        status: "needs_revision",
        reviewed_by: adminUserId,
        reviewed_at: now,
        admin_feedback: feedback,
      })
      .eq("id", productId)
      .select("id, name, status, reviewed_by, reviewed_at, admin_feedback")
      .single();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    // Send email to supplier with feedback
    const supplierEmail = await this.getSupplierEmail(product.supplier_id);
    if (supplierEmail) {
      const html = baseLayout({
        title: "Product Changes Requested",
        preheader: `Changes requested for "${product.name}"`,
        body: `
          <p>An admin has requested changes to your product <strong>${escapeHtml(product.name)}</strong>.</p>
          <p><strong>SKU:</strong> ${escapeHtml(product.sku)}</p>
          <p><strong>Feedback:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">${escapeHtml(feedback)}</blockquote>
          <p>Please update your product and resubmit for review.</p>
        `,
      });
      void sendEmail(supplierEmail, `Changes Requested: ${product.name}`, html);
    }

    void AuditLogService.log({
      adminId: adminUserId,
      action: "product_changes_requested",
      resourceType: "product",
      resourceId: productId,
      details: { productName: product.name, feedback },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });

    const row = data as {
      id: string;
      name: string;
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      admin_feedback: string | null;
    };
    return row;
  }

  /**
   * PUT /api/admin/products/:id/reject
   */
  static async reject(
    productId: string,
    adminUserId: string,
    reason: string,
    auditCtx?: AuditContext,
  ): Promise<ReviewedProduct> {
    const product = await this.getProductForReview(productId);

    if (product.status !== "pending") {
      throw badRequest(
        `Cannot reject product with status '${product.status}'. Only pending products can be rejected.`,
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("products")
      .update({
        status: "rejected",
        reviewed_by: adminUserId,
        reviewed_at: now,
        admin_feedback: reason,
      })
      .eq("id", productId)
      .select("id, name, status, reviewed_by, reviewed_at, admin_feedback")
      .single();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    // Send email to supplier with rejection reason
    const supplierEmail = await this.getSupplierEmail(product.supplier_id);
    if (supplierEmail) {
      const html = baseLayout({
        title: "Product Rejected",
        preheader: `Your product "${product.name}" was not approved`,
        body: `
          <p>Your product <strong>${escapeHtml(product.name)}</strong> has been rejected.</p>
          <p><strong>SKU:</strong> ${escapeHtml(product.sku)}</p>
          <p><strong>Reason:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #555;">${escapeHtml(reason)}</blockquote>
          <p>You may edit and resubmit the product for review.</p>
        `,
      });
      void sendEmail(supplierEmail, `Product Rejected: ${product.name}`, html);
    }

    logAdminAction({
      action: "product_rejected",
      adminId: adminUserId,
      targetUserId: product.supplier_id,
      reason,
      timestamp: now,
    });

    void AuditLogService.log({
      adminId: adminUserId,
      action: "product_rejected",
      resourceType: "product",
      resourceId: productId,
      details: { productName: product.name, reason },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });

    const row = data as {
      id: string;
      name: string;
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      admin_feedback: string | null;
    };
    return row;
  }

  // ── New methods (Sprint 4 Task 3) ──────────────────────────────────────

  static async listProducts(options?: {
    page?: number;
    limit?: number;
    status?: string;
    supplierId?: string;
    category?: string;
    search?: string;
    sortBy?: "created_at" | "name" | "price" | "status";
    sortOrder?: "asc" | "desc";
  }): Promise<PaginatedResult<AdminProductListItem>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const sortBy = options?.sortBy ?? "created_at";
    const sortOrder = options?.sortOrder ?? "desc";
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("products")
      .select(
        "id, name, sku, price, stock_quantity, category, status, supplier_id, is_featured, created_at, suppliers(business_name)",
        { count: "exact" },
      )
      .eq("is_deleted", false);

    if (options?.status) {
      query = query.eq("status", options.status);
    }
    if (options?.supplierId) {
      query = query.eq("supplier_id", options.supplierId);
    }
    if (options?.category) {
      query = query.eq("category", options.category);
    }
    if (options?.search) {
      query = query.or(
        `name.ilike.%${options.search}%,sku.ilike.%${options.search}%,description.ilike.%${options.search}%`,
      );
    }

    query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list products: ${error.message}`);
    }

    type ProductListRow = {
      id: string;
      name: string;
      sku: string;
      price: string;
      stock_quantity: number;
      category: string | null;
      status: string;
      supplier_id: string;
      is_featured: boolean;
      created_at: string;
      suppliers: { business_name: string } | null;
    };

    const rows = (data ?? []) as unknown as ProductListRow[];
    const total = count ?? 0;

    const items: AdminProductListItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      price: Number(row.price),
      stockQuantity: row.stock_quantity,
      category: row.category,
      status: row.status,
      supplierName: row.suppliers?.business_name ?? "Unknown",
      supplierId: row.supplier_id,
      isFeatured: row.is_featured ?? false,
      createdAt: row.created_at,
    }));

    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getProductDetail(productId: string): Promise<AdminProductDetail> {
    const { data: productData, error: productError } = await supabaseAdmin
      .from("products")
      .select(PRODUCT_REVIEW_FIELDS + ", is_featured")
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (productError) {
      throw new AppError(productError.message, 500, "DATABASE_ERROR");
    }
    if (!productData) {
      throw notFound("Product");
    }

    const product = productData as unknown as ProductRow & { is_featured: boolean };

    // Fetch supplier info
    const { data: supplierData } = await supabaseAdmin
      .from("suppliers")
      .select("id, business_name, status, commission_rate")
      .eq("id", product.supplier_id)
      .single();

    const supplier = (supplierData as unknown as {
      id: string;
      business_name: string;
      status: string;
      commission_rate: string | null;
    }) ?? {
      id: product.supplier_id,
      business_name: "Unknown",
      status: "unknown",
      commission_rate: null,
    };

    // Fetch sales stats
    const { data: salesData } = await supabaseAdmin
      .from("order_items")
      .select("quantity, subtotal")
      .eq("product_id", productId);

    type SalesRow = { quantity: number; subtotal: string };
    const salesRows = (salesData ?? []) as unknown as SalesRow[];

    const salesStats = {
      totalOrders: salesRows.length,
      totalSold: salesRows.reduce((sum, r) => sum + r.quantity, 0),
      totalRevenue:
        Math.round(salesRows.reduce((sum, r) => sum + Number(r.subtotal), 0) * 100) / 100,
    };

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      sku: product.sku,
      price: Number(product.price),
      stockQuantity: product.stock_quantity,
      category: product.category,
      status: product.status,
      images: product.images,
      specifications: product.specifications,
      weight: product.weight !== null ? Number(product.weight) : null,
      dimensions: product.dimensions,
      isFeatured: product.is_featured ?? false,
      isDeleted: product.is_deleted,
      reviewedBy: product.reviewed_by,
      reviewedAt: product.reviewed_at,
      adminFeedback: product.admin_feedback,
      supplier: {
        id: supplier.id,
        businessName: supplier.business_name,
        status: supplier.status,
        commissionRate: Number(supplier.commission_rate ?? 15),
      },
      salesStats,
      createdAt: product.created_at,
      updatedAt: product.updated_at,
    };
  }

  static async featureProduct(
    productId: string,
    adminId: string,
    auditCtx?: AuditContext,
  ): Promise<void> {
    const product = await this.getProductForReview(productId);

    if (product.status !== "active") {
      throw conflict("Only active products can be featured");
    }

    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_featured: true })
      .eq("id", productId);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    logAdminAction({
      action: "product_featured",
      adminId,
      targetUserId: product.supplier_id,
      timestamp: new Date().toISOString(),
    });

    void AuditLogService.log({
      adminId,
      action: "product_featured",
      resourceType: "product",
      resourceId: productId,
      details: { productName: product.name },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  static async unfeatureProduct(
    productId: string,
    adminId: string,
    auditCtx?: AuditContext,
  ): Promise<void> {
    const product = await this.getProductForReview(productId);

    const { error } = await supabaseAdmin
      .from("products")
      .update({ is_featured: false })
      .eq("id", productId);

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }

    logAdminAction({
      action: "product_unfeatured",
      adminId,
      targetUserId: product.supplier_id,
      timestamp: new Date().toISOString(),
    });

    void AuditLogService.log({
      adminId,
      action: "product_unfeatured",
      resourceType: "product",
      resourceId: productId,
      details: { productName: product.name },
      ipAddress: auditCtx?.ipAddress,
      userAgent: auditCtx?.userAgent,
    });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private static async getProductForReview(
    productId: string,
  ): Promise<{ id: string; supplier_id: string; name: string; sku: string; status: string }> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id, supplier_id, name, sku, status")
      .eq("id", productId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error) {
      throw new AppError(error.message, 500, "DATABASE_ERROR");
    }
    if (!data) {
      throw notFound("Product");
    }

    return data as { id: string; supplier_id: string; name: string; sku: string; status: string };
  }

  private static async getSupplierEmail(supplierId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from("suppliers")
      .select("contact_email")
      .eq("id", supplierId)
      .maybeSingle();

    return (data as { contact_email: string } | null)?.contact_email ?? null;
  }
}
