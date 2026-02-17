import type { ShippingAddress } from "./checkout.types";

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  supplier_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  fulfillment_status: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  parent_order_id: string | null;
  supplier_id: string | null;
  total_amount: number;
  tax_amount: number;
  shipping_address: ShippingAddress;
  status: string;
  payment_status: string;
  payment_intent_id: string | null;
  notes: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

export interface CreateOrderResult {
  order: Order;
}
