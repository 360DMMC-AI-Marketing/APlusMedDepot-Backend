export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
}

export interface PaymentConfirmationResult {
  orderId: string;
  status: string;
  paidAt: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
  amount: number;
}

export interface PaymentAttempt {
  id: string;
  status: string;
  amount: number;
  createdAt: string;
  failureReason: string | null;
}

export interface LogPaymentEventData {
  orderId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency?: string;
  status: string;
  paymentMethod?: string;
  failureReason?: string;
  stripeEventId?: string;
  paidAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  status: string;
  stripeChargeId: string | null;
  paymentMethod: string | null;
  failureReason: string | null;
  stripeEventId: string | null;
  paidAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
