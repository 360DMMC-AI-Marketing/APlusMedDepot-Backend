import { supabaseAdmin } from "../config/supabase";
import type {
  SupplierRegistrationRequest,
  SupplierResponse,
  SupplierDetailResponse,
  SupplierUpdateRequest,
  SupplierDocument,
} from "../types/supplier.types";
import { conflict, AppError, notFound, badRequest } from "../utils/errors";

type SupplierRow = {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string | null;
  status: string;
  commission_rate: number;
  created_at: string;
};

type SupplierDetailRow = {
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
};

const SUPPLIER_SELECT_FIELDS =
  "id, user_id, business_name, business_type, status, commission_rate, created_at";

const SUPPLIER_DETAIL_FIELDS =
  "id, user_id, business_name, business_type, tax_id, contact_name, contact_email, phone, address, bank_account_info, product_categories, commission_rate, status, rejection_reason, current_balance, years_in_business, approved_at, approved_by, created_at, updated_at";

const DOCUMENT_SELECT_FIELDS =
  "id, supplier_id, document_type, file_name, file_size, mime_type, storage_path, status, rejection_reason, review_notes, uploaded_at, reviewed_at";

const DOCUMENT_BUCKET = "supplier-documents";
const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

const toSupplierResponse = (row: SupplierRow): SupplierResponse => ({
  id: row.id,
  userId: row.user_id,
  businessName: row.business_name,
  businessType: row.business_type,
  status: row.status,
  commissionRate: row.commission_rate,
  createdAt: row.created_at,
});

export class SupplierService {
  static async ensureDocumentBucket(): Promise<void> {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();

    const exists = buckets?.some((b) => b.name === DOCUMENT_BUCKET);
    if (exists) return;

    const { error } = await supabaseAdmin.storage.createBucket(DOCUMENT_BUCKET, {
      public: false,
    });

    if (error) {
      throw new AppError(error.message, 500, "STORAGE_ERROR");
    }
  }

  static async register(
    userId: string,
    data: SupplierRegistrationRequest,
    files: Express.Multer.File[],
  ): Promise<SupplierResponse> {
    // Check if supplier already exists
    const { data: existingSupplier, error: checkError } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (checkError) {
      throw new AppError("Database error checking existing supplier", 500, "DATABASE_ERROR");
    }

    if (existingSupplier) {
      throw conflict("You already have a supplier application");
    }

    // Insert supplier record
    const { data: supplierRow, error: insertError } = await supabaseAdmin
      .from("suppliers")
      .insert({
        user_id: userId,
        business_name: data.businessName,
        business_type: data.businessType ?? null,
        tax_id: data.taxId,
        contact_name: data.contactName,
        contact_email: data.contactEmail,
        phone: data.phone,
        address: data.address,
        bank_account_info: data.bankAccountInfo,
        product_categories: data.productCategories,
        status: "pending",
        commission_rate: 15.0,
      })
      .select(SUPPLIER_SELECT_FIELDS)
      .single();

    if (insertError || !supplierRow) {
      throw new AppError(insertError?.message ?? "Supplier insert failed", 500, "DATABASE_ERROR");
    }

    // Ensure bucket exists
    await this.ensureDocumentBucket();

    // Upload documents if provided
    if (files && files.length > 0) {
      for (const file of files) {
        // Validate mime type
        if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          throw new AppError(
            "Invalid file type. Allowed: PDF, DOC, DOCX, JPEG, PNG",
            400,
            "BAD_REQUEST",
          );
        }

        // Sanitize filename
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        const ext = sanitized.split(".").pop() || "bin";
        const timestamp = Date.now();

        // Determine document type from fieldname
        const documentType = file.fieldname || "other";

        // Storage path: {supplierId}/{documentType}_{timestamp}.{ext}
        const storagePath = `${supplierRow.id}/${documentType}_${timestamp}.${ext}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
          .from(DOCUMENT_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (uploadError) {
          throw new AppError(uploadError.message, 500, "STORAGE_ERROR");
        }

        // Insert document record
        const { error: docError } = await supabaseAdmin.from("supplier_documents").insert({
          supplier_id: supplierRow.id,
          document_type: documentType,
          file_name: file.originalname,
          file_size: file.size,
          mime_type: file.mimetype,
          storage_path: storagePath,
          status: "pending",
        });

        if (docError) {
          throw new AppError(
            docError.message ?? "Document record insert failed",
            500,
            "DATABASE_ERROR",
          );
        }
      }
    }

    return toSupplierResponse(supplierRow);
  }

  static async getProfile(supplierId: string): Promise<SupplierDetailResponse> {
    // Fetch full supplier record
    const { data: supplierData, error: supplierError } = await supabaseAdmin
      .from("suppliers")
      .select(SUPPLIER_DETAIL_FIELDS)
      .eq("id", supplierId)
      .single();

    if (supplierError || !supplierData) {
      throw notFound("Supplier");
    }

    const supplier = supplierData as unknown as SupplierDetailRow;

    // Fetch supplier documents
    const { data: documentsData, error: documentsError } = await supabaseAdmin
      .from("supplier_documents")
      .select(DOCUMENT_SELECT_FIELDS)
      .eq("supplier_id", supplierId);

    if (documentsError) {
      throw new AppError(documentsError.message, 500, "DATABASE_ERROR");
    }

    const documentRows = (documentsData as unknown as SupplierDocumentRow[]) ?? [];

    // Generate signed URLs for documents
    const documents: SupplierDocument[] = await Promise.all(
      documentRows.map(async (doc) => {
        let signedUrl: string | undefined;
        try {
          const { data: urlData } = await supabaseAdmin.storage
            .from(DOCUMENT_BUCKET)
            .createSignedUrl(doc.storage_path, 3600);
          signedUrl = urlData?.signedUrl;
        } catch {
          signedUrl = undefined;
        }

        return {
          id: doc.id,
          supplierId: doc.supplier_id,
          documentType: doc.document_type,
          filePath: doc.storage_path,
          fileName: doc.file_name,
          fileSize: doc.file_size,
          mimeType: doc.mime_type,
          status: doc.status,
          rejectionReason: doc.rejection_reason,
          reviewNotes: doc.review_notes,
          uploadedAt: doc.uploaded_at,
          reviewedAt: doc.reviewed_at,
          signedUrl,
        };
      }),
    );

    return {
      id: supplier.id,
      userId: supplier.user_id,
      businessName: supplier.business_name,
      businessType: supplier.business_type,
      taxId: supplier.tax_id,
      contactName: supplier.contact_name,
      contactEmail: supplier.contact_email,
      phone: supplier.phone,
      address: supplier.address,
      bankAccountInfo: supplier.bank_account_info,
      productCategories: supplier.product_categories,
      commissionRate: supplier.commission_rate,
      status: supplier.status,
      rejectionReason: supplier.rejection_reason,
      currentBalance: supplier.current_balance,
      yearsInBusiness: supplier.years_in_business,
      approvedAt: supplier.approved_at,
      approvedBy: supplier.approved_by,
      createdAt: supplier.created_at,
      updatedAt: supplier.updated_at,
      documents,
    };
  }

  static async updateProfile(
    supplierId: string,
    data: Partial<SupplierUpdateRequest>,
  ): Promise<SupplierResponse> {
    // Blocked fields that must NEVER be updated
    const blockedFields = [
      "status",
      "commission_rate",
      "user_id",
      "id",
      "approved_at",
      "approved_by",
      "current_balance",
      "commissionRate",
      "userId",
      "approvedAt",
      "approvedBy",
      "currentBalance",
    ];

    // Check if any blocked field is in the data
    for (const field of blockedFields) {
      if (field in data) {
        throw badRequest(`Cannot update ${field}`);
      }
    }

    // Map camelCase to snake_case
    const updateData: Record<string, unknown> = {};

    if (data.businessName !== undefined) {
      updateData.business_name = data.businessName;
    }
    if (data.businessType !== undefined) {
      updateData.business_type = data.businessType;
    }
    if (data.contactName !== undefined) {
      updateData.contact_name = data.contactName;
    }
    if (data.contactEmail !== undefined) {
      updateData.contact_email = data.contactEmail;
    }
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
    }
    if (data.address !== undefined) {
      updateData.address = data.address;
    }
    if (data.bankAccountInfo !== undefined) {
      updateData.bank_account_info = data.bankAccountInfo;
    }
    if (data.productCategories !== undefined) {
      updateData.product_categories = data.productCategories;
    }

    // If no fields to update, throw error
    if (Object.keys(updateData).length === 0) {
      throw badRequest("No fields to update");
    }

    // Update supplier
    const { data: updatedData, error } = await supabaseAdmin
      .from("suppliers")
      .update(updateData)
      .eq("id", supplierId)
      .select(SUPPLIER_SELECT_FIELDS)
      .single();

    if (error || !updatedData) {
      throw new AppError(error?.message ?? "Supplier update failed", 500, "DATABASE_ERROR");
    }

    return toSupplierResponse(updatedData as unknown as SupplierRow);
  }
}
