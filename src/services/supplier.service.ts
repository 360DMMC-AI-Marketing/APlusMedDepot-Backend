import { supabaseAdmin } from "../config/supabase";
import type { SupplierRegistrationRequest, SupplierResponse } from "../types/supplier.types";
import { conflict, AppError } from "../utils/errors";

type SupplierRow = {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string | null;
  status: string;
  commission_rate: number;
  created_at: string;
};

const SUPPLIER_SELECT_FIELDS =
  "id, user_id, business_name, business_type, status, commission_rate, created_at";

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
}
