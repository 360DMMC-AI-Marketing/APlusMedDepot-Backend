export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  supplierId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Cart {
  id: string;
  customerId: string;
  items: CartItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  itemCount: number;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price: string;
  created_at: string;
  updated_at: string;
  products: {
    name: string;
    images: string[] | null;
    supplier_id: string;
  };
}

export type CartIssueType = "price_changed" | "insufficient_stock" | "product_unavailable";

export interface CartValidationIssue {
  cartItemId: string;
  productId: string;
  issueType: CartIssueType;
  details: {
    oldPrice?: number;
    newPrice?: number;
    availableStock?: number;
  };
}

export interface CartValidationResult {
  valid: boolean;
  issues: CartValidationIssue[];
}

export interface CartRefreshChange {
  cartItemId: string;
  changeType: "price_updated" | "quantity_adjusted" | "item_removed";
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface CartRefreshResult {
  cart: Cart;
  changesMade: CartRefreshChange[];
}
