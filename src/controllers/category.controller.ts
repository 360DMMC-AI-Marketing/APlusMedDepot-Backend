import type { Request, Response } from "express";
import { PRODUCT_CATEGORIES } from "../constants/categories";

export class CategoryController {
  static async getCategories(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      categories: PRODUCT_CATEGORIES.map((name, index) => ({
        id: index + 1,
        name,
        slug: name
          .toLowerCase()
          .replace(/[()]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .trim(),
      })),
      total: PRODUCT_CATEGORIES.length,
    });
  }
}
