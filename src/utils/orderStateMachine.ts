export const ORDER_STATUSES = [
  "pending_payment",
  "payment_processing",
  "payment_confirmed",
  "awaiting_fulfillment",
  "partially_shipped",
  "fully_shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["payment_processing", "cancelled"],
  payment_processing: ["payment_confirmed", "pending_payment"],
  payment_confirmed: ["awaiting_fulfillment"],
  awaiting_fulfillment: ["partially_shipped", "cancelled"],
  partially_shipped: ["fully_shipped", "cancelled"],
  fully_shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
};

const TERMINAL: Set<OrderStatus> = new Set(["refunded"]);

const STATUS_SET: Set<string> = new Set(ORDER_STATUSES);

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

export function isValidTransition(current: OrderStatus, next: OrderStatus): boolean {
  if (!isOrderStatus(current) || !isOrderStatus(next)) return false;
  return VALID_TRANSITIONS[current].includes(next);
}

export function getNextStatuses(current: OrderStatus): OrderStatus[] {
  if (!isOrderStatus(current)) return [];
  return VALID_TRANSITIONS[current];
}

export function isTerminalStatus(status: OrderStatus): boolean {
  if (!isOrderStatus(status)) return false;
  return TERMINAL.has(status);
}
