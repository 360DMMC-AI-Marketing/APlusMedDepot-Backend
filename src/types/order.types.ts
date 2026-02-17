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
  tracking_number?: string | null;
  carrier?: string | null;
  product_image?: string | null;
  supplier_name?: string;
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  item_count: number;
  created_at: string;
}

export interface OrderListResult {
  orders: OrderSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  reason: string | null;
  created_at: string;
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
  status_history?: OrderStatusHistory[];
  created_at: string;
  updated_at: string;
}

export interface CreateOrderResult {
  order: Order;
}
