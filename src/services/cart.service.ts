import { supabaseAdmin } from "../config/supabase";
import { notFound, badRequest, forbidden, AppError } from "../utils/errors";
import type {
  Cart,
  CartItem,
  CartItemRow,
  CartValidationResult,
  CartValidationIssue,
  CartRefreshResult,
  CartRefreshChange,
} from "../types/cart.types";

const DEFAULT_TAX_RATE = 0.0825;

const CART_ITEM_SELECT =
  "id, cart_id, product_id, quantity, unit_price, created_at, updated_at, products(name, images, supplier_id)";

function getTaxRate(): number {
  const envRate = process.env.TAX_RATE;
  if (envRate !== undefined) {
    const parsed = Number(envRate);
    if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
  }
  return DEFAULT_TAX_RATE;
}

function toCartItem(row: CartItemRow): CartItem {
  const product = row.products as unknown as {
    name: string;
    images: string[] | null;
    supplier_id: string;
  };
  const unitPrice = Number(row.unit_price);
  return {
    id: row.id,
    productId: row.product_id,
    productName: product.name,
    productImage: product.images && product.images.length > 0 ? product.images[0] : null,
    supplierId: product.supplier_id,
    quantity: row.quantity,
    unitPrice,
    subtotal: Math.round(unitPrice * row.quantity * 100) / 100,
  };
}

export class CartService {
  static async getOrCreateCart(userId: string): Promise<string> {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (existing && !fetchError) {
      return (existing as { id: string }).id;
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("carts")
      .insert({ customer_id: userId, status: "active" })
      .select("id")
      .single();

    if (createError || !created) {
      throw new AppError("Failed to create cart", 500, "DATABASE_ERROR");
    }

    return (created as { id: string }).id;
  }

  static async getCart(userId: string): Promise<Cart> {
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id, customer_id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (cartError || !cart) {
      const taxRate = getTaxRate();
      return {
        id: "",
        customerId: userId,
        items: [],
        subtotal: 0,
        taxRate,
        taxAmount: 0,
        total: 0,
        itemCount: 0,
      };
    }

    const cartRow = cart as { id: string; customer_id: string };

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select(CART_ITEM_SELECT)
      .eq("cart_id", cartRow.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      throw new AppError(itemsError.message, 500, "DATABASE_ERROR");
    }

    const cartItems = ((items as unknown as CartItemRow[] | null) ?? []).map(toCartItem);
    const totals = CartService.calculateCartTotals(cartItems);

    return {
      id: cartRow.id,
      customerId: cartRow.customer_id,
      items: cartItems,
      ...totals,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  static async addItemToCart(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartItem> {
    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock_quantity, status, is_deleted, images, supplier_id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      throw notFound("Product");
    }

    const prod = product as {
      id: string;
      name: string;
      price: string;
      stock_quantity: number;
      status: string;
      is_deleted: boolean;
      images: string[] | null;
      supplier_id: string;
    };

    if (prod.status !== "active" || prod.is_deleted) {
      throw badRequest("Product is not available for purchase");
    }

    if (quantity > prod.stock_quantity) {
      throw badRequest(`Insufficient stock. Available: ${prod.stock_quantity}`);
    }

    const cartId = await CartService.getOrCreateCart(userId);

    const { data: existingItem, error: existingError } = await supabaseAdmin
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cartId)
      .eq("product_id", productId)
      .single();

    const unitPrice = Number(prod.price);

    if (existingItem && !existingError) {
      const existing = existingItem as { id: string; quantity: number };
      const newQuantity = existing.quantity + quantity;

      if (newQuantity > prod.stock_quantity) {
        throw badRequest(
          `Insufficient stock. Available: ${prod.stock_quantity}, in cart: ${existing.quantity}`,
        );
      }

      const { data: updated, error: updateError } = await supabaseAdmin
        .from("cart_items")
        .update({ quantity: newQuantity, unit_price: unitPrice })
        .eq("id", existing.id)
        .select(CART_ITEM_SELECT)
        .single();

      if (updateError || !updated) {
        throw new AppError("Failed to update cart item", 500, "DATABASE_ERROR");
      }

      return toCartItem(updated as unknown as CartItemRow);
    }

    const { data: created, error: createError } = await supabaseAdmin
      .from("cart_items")
      .insert({
        cart_id: cartId,
        product_id: productId,
        quantity,
        unit_price: unitPrice,
      })
      .select(CART_ITEM_SELECT)
      .single();

    if (createError || !created) {
      throw new AppError("Failed to add item to cart", 500, "DATABASE_ERROR");
    }

    return toCartItem(created as unknown as CartItemRow);
  }

  static async updateCartItem(userId: string, itemId: string, quantity: number): Promise<CartItem> {
    const { data: cartItem, error: itemError } = await supabaseAdmin
      .from("cart_items")
      .select("id, cart_id, product_id, carts(customer_id)")
      .eq("id", itemId)
      .single();

    if (itemError || !cartItem) {
      throw notFound("Cart item");
    }

    const item = cartItem as unknown as {
      id: string;
      cart_id: string;
      product_id: string;
      carts: { customer_id: string };
    };

    if (item.carts.customer_id !== userId) {
      throw forbidden("Not authorized to update this cart item");
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, price, stock_quantity")
      .eq("id", item.product_id)
      .single();

    if (productError || !product) {
      throw notFound("Product");
    }

    const prod = product as { id: string; price: string; stock_quantity: number };

    if (quantity > prod.stock_quantity) {
      throw badRequest(`Insufficient stock. Available: ${prod.stock_quantity}`);
    }

    const unitPrice = Number(prod.price);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("cart_items")
      .update({ quantity, unit_price: unitPrice })
      .eq("id", itemId)
      .select(CART_ITEM_SELECT)
      .single();

    if (updateError || !updated) {
      throw new AppError("Failed to update cart item", 500, "DATABASE_ERROR");
    }

    return toCartItem(updated as unknown as CartItemRow);
  }

  static async removeCartItem(userId: string, itemId: string): Promise<void> {
    const { data: cartItem, error: itemError } = await supabaseAdmin
      .from("cart_items")
      .select("id, cart_id, carts(customer_id)")
      .eq("id", itemId)
      .single();

    if (itemError || !cartItem) {
      throw notFound("Cart item");
    }

    const item = cartItem as unknown as {
      id: string;
      cart_id: string;
      carts: { customer_id: string };
    };

    if (item.carts.customer_id !== userId) {
      throw forbidden("Not authorized to remove this cart item");
    }

    const { error: deleteError } = await supabaseAdmin.from("cart_items").delete().eq("id", itemId);

    if (deleteError) {
      throw new AppError(deleteError.message, 500, "DATABASE_ERROR");
    }
  }

  static async clearCart(userId: string): Promise<Cart> {
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (cart && !cartError) {
      const cartRow = cart as { id: string };
      const { error: deleteError } = await supabaseAdmin
        .from("cart_items")
        .delete()
        .eq("cart_id", cartRow.id);

      if (deleteError) {
        throw new AppError(deleteError.message, 500, "DATABASE_ERROR");
      }
    }

    const taxRate = getTaxRate();
    return {
      id: cart ? (cart as { id: string }).id : "",
      customerId: userId,
      items: [],
      subtotal: 0,
      taxRate,
      taxAmount: 0,
      total: 0,
      itemCount: 0,
    };
  }

  static async validateCartItems(userId: string): Promise<CartValidationResult> {
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (cartError || !cart) {
      return { valid: true, issues: [] };
    }

    const cartRow = cart as { id: string };

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select("id, product_id, quantity, unit_price")
      .eq("cart_id", cartRow.id);

    if (itemsError || !items || items.length === 0) {
      return { valid: true, issues: [] };
    }

    const cartItems = items as {
      id: string;
      product_id: string;
      quantity: number;
      unit_price: string;
    }[];
    const productIds = cartItems.map((item) => item.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, price, stock_quantity, status, is_deleted")
      .in("id", productIds);

    if (productsError) {
      throw new AppError(productsError.message, 500, "DATABASE_ERROR");
    }

    const productMap = new Map<
      string,
      {
        id: string;
        price: string;
        stock_quantity: number;
        status: string;
        is_deleted: boolean;
      }
    >();

    for (const p of (products ?? []) as {
      id: string;
      price: string;
      stock_quantity: number;
      status: string;
      is_deleted: boolean;
    }[]) {
      productMap.set(p.id, p);
    }

    const issues: CartValidationIssue[] = [];

    for (const item of cartItems) {
      const product = productMap.get(item.product_id);

      if (!product || product.status !== "active" || product.is_deleted) {
        issues.push({
          cartItemId: item.id,
          productId: item.product_id,
          issueType: "product_unavailable",
          details: {},
        });
        continue;
      }

      const currentPrice = Number(product.price);
      const cartPrice = Number(item.unit_price);

      if (currentPrice !== cartPrice) {
        issues.push({
          cartItemId: item.id,
          productId: item.product_id,
          issueType: "price_changed",
          details: { oldPrice: cartPrice, newPrice: currentPrice },
        });
      }

      if (product.stock_quantity < item.quantity) {
        issues.push({
          cartItemId: item.id,
          productId: item.product_id,
          issueType: "insufficient_stock",
          details: { availableStock: product.stock_quantity },
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  static async refreshCart(userId: string): Promise<CartRefreshResult> {
    const { data: cart, error: cartError } = await supabaseAdmin
      .from("carts")
      .select("id")
      .eq("customer_id", userId)
      .eq("status", "active")
      .single();

    if (cartError || !cart) {
      const emptyCart = await CartService.getCart(userId);
      return { cart: emptyCart, changesMade: [] };
    }

    const cartRow = cart as { id: string };

    const { data: items, error: itemsError } = await supabaseAdmin
      .from("cart_items")
      .select("id, product_id, quantity, unit_price")
      .eq("cart_id", cartRow.id);

    if (itemsError || !items || items.length === 0) {
      const currentCart = await CartService.getCart(userId);
      return { cart: currentCart, changesMade: [] };
    }

    const cartItems = items as {
      id: string;
      product_id: string;
      quantity: number;
      unit_price: string;
    }[];
    const productIds = cartItems.map((item) => item.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from("products")
      .select("id, price, stock_quantity, status, is_deleted")
      .in("id", productIds);

    if (productsError) {
      throw new AppError(productsError.message, 500, "DATABASE_ERROR");
    }

    const productMap = new Map<
      string,
      {
        id: string;
        price: string;
        stock_quantity: number;
        status: string;
        is_deleted: boolean;
      }
    >();

    for (const p of (products ?? []) as {
      id: string;
      price: string;
      stock_quantity: number;
      status: string;
      is_deleted: boolean;
    }[]) {
      productMap.set(p.id, p);
    }

    const changesMade: CartRefreshChange[] = [];

    for (const item of cartItems) {
      const product = productMap.get(item.product_id);

      if (
        !product ||
        product.status !== "active" ||
        product.is_deleted ||
        product.stock_quantity === 0
      ) {
        await supabaseAdmin.from("cart_items").delete().eq("id", item.id);
        changesMade.push({
          cartItemId: item.id,
          changeType: "item_removed",
          before: { productId: item.product_id, quantity: item.quantity },
          after: {},
        });
        continue;
      }

      const currentPrice = Number(product.price);
      const cartPrice = Number(item.unit_price);
      let needsUpdate = false;
      const updateData: Record<string, unknown> = {};

      if (currentPrice !== cartPrice) {
        changesMade.push({
          cartItemId: item.id,
          changeType: "price_updated",
          before: { unitPrice: cartPrice },
          after: { unitPrice: currentPrice },
        });
        updateData.unit_price = currentPrice;
        needsUpdate = true;
      }

      if (product.stock_quantity < item.quantity) {
        changesMade.push({
          cartItemId: item.id,
          changeType: "quantity_adjusted",
          before: { quantity: item.quantity },
          after: { quantity: product.stock_quantity },
        });
        updateData.quantity = product.stock_quantity;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await supabaseAdmin.from("cart_items").update(updateData).eq("id", item.id);
      }
    }

    const refreshedCart = await CartService.getCart(userId);
    return { cart: refreshedCart, changesMade };
  }

  static calculateCartTotals(items: CartItem[]): {
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  } {
    const taxRate = getTaxRate();
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    return { subtotal, taxRate, taxAmount, total };
  }
}
