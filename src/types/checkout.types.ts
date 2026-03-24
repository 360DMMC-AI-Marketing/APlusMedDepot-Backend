export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
}

export interface CheckoutItemPreview {
  product_id: string;
  product_name: string;
  supplier_id: string;
  supplier_name: string;
  quantity: number;
  current_price: number;
  subtotal: number;
}

export interface SupplierGroup {
  supplier_id: string;
  supplier_name: string;
  items: CheckoutItemPreview[];
  subtotal: number;
}

export interface OrderPreview {
  items: CheckoutItemPreview[];
  supplier_groups: SupplierGroup[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  shipping_address: ShippingAddress;
}

export type CheckoutErrorType =
  | "empty_cart"
  | "out_of_stock"
  | "product_unavailable"
  | "invalid_address";

export interface CheckoutError {
  type: CheckoutErrorType;
  product_id?: string;
  product_name?: string;
  available?: number;
  requested?: number;
  field?: string;
  message?: string;
}

export interface CheckoutValidResult {
  valid: true;
  order_preview: OrderPreview;
}

export interface CheckoutInvalidResult {
  valid: false;
  errors: CheckoutError[];
}

export type CheckoutValidationResult = CheckoutValidResult | CheckoutInvalidResult;
