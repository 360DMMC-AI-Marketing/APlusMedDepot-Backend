import { supabaseAdmin } from "../config/supabase";
import { AppError, badRequest } from "../utils/errors";

const BUCKET_NAME = "product-images";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export class StorageService {
  static async ensureBucket(): Promise<void> {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();

    const exists = buckets?.some((b) => b.name === BUCKET_NAME);
    if (exists) return;

    const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
      public: false,
    });

    if (error) {
      throw new AppError(error.message, 500, "STORAGE_ERROR");
    }
  }

  static async uploadImage(
    file: Buffer,
    fileName: string,
    mimeType: string,
    productId: string,
    supplierId: string,
  ): Promise<string> {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw badRequest("Invalid file type. Allowed: JPEG, PNG, WebP");
    }

    if (file.length > MAX_FILE_SIZE) {
      throw badRequest("File too large. Maximum size is 5MB");
    }

    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${supplierId}/${productId}/${Date.now()}_${sanitized}`;

    const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).upload(storagePath, file, {
      contentType: mimeType,
      upsert: false,
    });

    if (error) {
      throw new AppError(error.message, 500, "STORAGE_ERROR");
    }

    return storagePath;
  }

  static async getSignedUrl(storagePath: string, expiresIn: number = 3600): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data) {
      throw new AppError("Failed to generate signed URL", 500, "STORAGE_ERROR");
    }

    return data.signedUrl;
  }

  static async getSignedUrls(storagePaths: string[], expiresIn: number = 3600): Promise<string[]> {
    if (storagePaths.length === 0) return [];

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrls(storagePaths, expiresIn);

    if (error || !data) {
      throw new AppError("Failed to generate signed URLs", 500, "STORAGE_ERROR");
    }

    return data.map((item) => item.signedUrl);
  }

  static async deleteImage(storagePath: string): Promise<void> {
    const { error } = await supabaseAdmin.storage.from(BUCKET_NAME).remove([storagePath]);

    if (error) {
      throw new AppError(error.message, 500, "STORAGE_ERROR");
    }
  }

  static async validateImageCount(productId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from("products")
      .select("images")
      .eq("id", productId)
      .single();

    if (error || !data) {
      return 0;
    }

    const row = data as { images: string[] | null };
    return (row.images ?? []).length;
  }
}
