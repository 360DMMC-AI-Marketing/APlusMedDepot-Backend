export interface PayPalOrderResult {
  paypalOrderId: string;
  approvalUrl: string;
}

export interface PayPalCaptureResult {
  orderId: string;
  status: string;
  paidAt: string | null;
}
