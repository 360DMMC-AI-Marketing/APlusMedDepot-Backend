import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../utils/errors";
import type {
  ShippingAddress,
  CheckoutError,
  CheckoutItemPreview,
  SupplierGroup,
  CheckoutValidationResult,
} from "../types/checkout.types";

const DEFAULT_TAX_RATE = 0.0825;

function getTaxRate(): number {
  const envRate = process.env.TAX_RATE;
  if (envRate !== undefined) {
    const parsed = Number(envRate);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_TAX_RATE;
}

export class CheckoutService {
  static async validateCheckout(
    userId: string,
    shippingAddress: ShippingAddress,
  ): Promise<CheckoutValidationResult> {
    // 1. Get cart
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (cartError || !cart) {
      return { valid: false, errors: [{ type: "empty_cart" }] };
    }

    const cartRow = cart as { id: string };

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select("id, product_id, quantity, unit_price")
      .eq("cart_id", cartRow.id);

    if (itemsError) {
      throw new AppError(itemsError.message, 500, "DATABASE_ERROR");
    }

    const cartItems = (items ?? []) as {
      id: string;
      product_id: string;
      quantity: number;
      unit_price: string;
    }[];

    if (cartItems.length === 0) {
      return { valid: false, errors: [{ type: "empty_cart" }] };
    }

    // 2. Fetch current product data with supplier info
    const productIds = cartItems.map((item) => item.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, price, stock_quantity, status, is_deleted, supplier_id, suppliers(business_name)",
      )
      .in("id", productIds);

    if (productsError) {
      throw new AppError(productsError.message, 500, "DATABASE_ERROR");
    }

    const productMap = new Map<
      string,
      {
        id: string;
        name: string;
        price: string;
        stock_quantity: number;
        status: string;
        is_deleted: boolean;
        supplier_id: string;
        suppliers: { business_name: string } | null;
      }
    >();

    for (const p of (products ?? []) as unknown as {
      id: string;
      name: string;
      price: string;
      stock_quantity: number;
      status: string;
      is_deleted: boolean;
      supplier_id: string;
      suppliers: { business_name: string } | null;
    }[]) {
      productMap.set(p.id, p);
    }

    // 3. Validate each cart item
    const errors: CheckoutError[] = [];
    const previewItems: CheckoutItemPreview[] = [];

    for (const item of cartItems) {
      const product = productMap.get(item.product_id);

      if (!product || product.status !== "active" || product.is_deleted) {
        errors.push({
          type: "product_unavailable",
          product_id: item.product_id,
          product_name: product?.name,
        });
        continue;
      }

      if (product.stock_quantity < item.quantity) {
        errors.push({
          type: "out_of_stock",
          product_id: item.product_id,
          product_name: product.name,
          available: product.stock_quantity,
          requested: item.quantity,
        });
        continue;
      }

      const currentPrice = Number(product.price);
      const subtotal = Math.round(currentPrice * item.quantity * 100) / 100;

      previewItems.push({
        product_id: product.id,
        product_name: product.name,
        supplier_id: product.supplier_id,
        supplier_name: product.suppliers?.business_name ?? "Unknown",
        quantity: item.quantity,
        current_price: currentPrice,
        subtotal,
      });
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // 4. Build supplier groups
    const groupMap = new Map<string, SupplierGroup>();

    for (const item of previewItems) {
      const existing = groupMap.get(item.supplier_id);
      if (existing) {
        existing.items.push(item);
        existing.subtotal = Math.round((existing.subtotal + item.subtotal) * 100) / 100;
      } else {
        groupMap.set(item.supplier_id, {
          supplier_id: item.supplier_id,
          supplier_name: item.supplier_name,
          items: [item],
          subtotal: item.subtotal,
        });
      }
    }

    const supplierGroups = Array.from(groupMap.values());

    // 5. Calculate totals
    const subtotal =
      Math.round(previewItems.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    const taxRate = getTaxRate();
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    return {
      valid: true,
      order_preview: {
        items: previewItems,
        supplier_groups: supplierGroups,
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        shipping_address: shippingAddress,
      },
    };
  }
}
