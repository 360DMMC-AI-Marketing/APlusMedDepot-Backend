import { Request, Response } from "express";

import { ProductService } from "../services/product.service";
import { StorageService } from "../services/storage.service";
import type { Product } from "../types/product.types";
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
  searchQuerySchema,
  uuidParamSchema,
} from "../validators/product.validator";
import { notFound, badRequest, forbidden } from "../utils/errors";

type PublicProduct = Omit<Product, "price" | "originalPrice"> & {
  price: number | null;
  originalPrice: number | null;
};

const stripPriceForAnonymous = (product: Product, isAuthed: boolean): PublicProduct =>
  isAuthed ? product : { ...product, price: null, originalPrice: null };

export class ProductController {
  static async list(req: Request, res: Response): Promise<void> {
    const query = productQuerySchema.parse(req.query);

    if (!query.status && req.user?.role !== "admin") {
      query.status = "active";
    }

    const result = await ProductService.list(query);
    const isAuthed = !!req.user;

    res.status(200).json({
      ...result,
      data: result.data.map((p) => stripPriceForAnonymous(p, isAuthed)),
    });
  }

  static async search(req: Request, res: Response): Promise<void> {
    const query = searchQuerySchema.parse(req.query);

    const result = await ProductService.search(query);
    const isAuthed = !!req.user;

    res.status(200).json({
      ...result,
      data: result.data.map((p) => stripPriceForAnonymous(p, isAuthed)),
    });
  }

  static async getById(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);

    const product = await ProductService.getById(id);
    if (!product) {
      throw notFound("Product");
    }

    res.status(200).json(stripPriceForAnonymous(product, !!req.user));
  }

  static async create(req: Request, res: Response): Promise<void> {
    const validated = createProductSchema.parse(req.body);
    const supplierId = await ProductService.getSupplierIdForUser(req.user!.id);

    const product = await ProductService.create(validated, supplierId);

    res.status(201).json(product);
  }

  static async update(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);
    const validated = updateProductSchema.parse(req.body);
    const isAdmin = req.user!.role === "admin";

    let supplierId: string | null = null;
    if (!isAdmin) {
      supplierId = await ProductService.getSupplierIdForUser(req.user!.id);
    }

    const product = await ProductService.update(id, validated, supplierId, isAdmin);

    res.status(200).json(product);
  }

  static async softDelete(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);
    const isAdmin = req.user!.role === "admin";

    let supplierId: string | null = null;
    if (!isAdmin) {
      supplierId = await ProductService.getSupplierIdForUser(req.user!.id);
    }

    await ProductService.softDelete(id, supplierId, isAdmin);

    res.status(200).json({ message: "Product deleted" });
  }

  static async uploadImage(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);
    const isAdmin = req.user!.role === "admin";

    const product = await ProductService.getById(id);
    if (!product) {
      throw notFound("Product");
    }

    if (!isAdmin) {
      const supplierId = await ProductService.getSupplierIdForUser(req.user!.id);
      if (product.supplierId !== supplierId) {
        throw forbidden("Not authorized to upload images for this product");
      }
    }

    const currentCount = await StorageService.validateImageCount(id);
    if (currentCount >= 5) {
      throw badRequest("Maximum 5 images per product");
    }

    const file = req.file;
    if (!file) {
      throw badRequest("No image file provided");
    }

    const storagePath = await StorageService.uploadImage(
      file.buffer,
      file.originalname,
      file.mimetype,
      id,
      product.supplierId,
    );

    await ProductService.appendImage(id, storagePath);

    const signedUrl = await StorageService.getSignedUrl(storagePath);

    res.status(201).json({
      storagePath,
      signedUrl,
      totalImages: currentCount + 1,
    });
  }

  static async deleteImage(req: Request, res: Response): Promise<void> {
    const id = uuidParamSchema.parse(req.params.id);
    const imageIndex = Number(req.params.imageIndex);
    const isAdmin = req.user!.role === "admin";

    if (Number.isNaN(imageIndex) || imageIndex < 0) {
      throw badRequest("Invalid image index");
    }

    const product = await ProductService.getById(id);
    if (!product) {
      throw notFound("Product");
    }

    if (!isAdmin) {
      const supplierId = await ProductService.getSupplierIdForUser(req.user!.id);
      if (product.supplierId !== supplierId) {
        throw forbidden("Not authorized to delete images for this product");
      }
    }

    const images = product.images;
    if (imageIndex >= images.length) {
      throw badRequest("Image index out of range");
    }

    const storagePath = images[imageIndex];

    await StorageService.deleteImage(storagePath);
    await ProductService.removeImage(id, imageIndex);

    res.status(200).json({
      message: "Image deleted",
      totalImages: images.length - 1,
    });
  }
}
