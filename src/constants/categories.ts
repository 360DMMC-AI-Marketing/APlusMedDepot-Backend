export const PRODUCT_CATEGORIES = [
  "Wound Care",
  "Vascular Access",
  "Incontinence Care",
  "Gloves",
  "Nursing Care Supplies",
  "Enteral Feeding Tubes",
  "Skin Biologics",
  "Advanced Wound Care",
  "PPE (Personal Protective Equipment)",
  "Central Supply",
  "DME (Durable Medical Equipment)",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export function isValidCategory(category: string): boolean {
  return PRODUCT_CATEGORIES.includes(category as ProductCategory);
}

export const categoryEnum = PRODUCT_CATEGORIES as unknown as [string, ...string[]];
