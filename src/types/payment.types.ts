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
