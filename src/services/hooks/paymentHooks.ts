export async function onPaymentSuccess(orderId: string): Promise<void> {
  // Stub: Dev 2 fills with commission calculation
  console.log(`[PAYMENT_HOOK] Payment success for order ${orderId}`);
}

export async function onPaymentRefunded(orderId: string): Promise<void> {
  // Stub: Dev 2 fills with commission reversal
  console.log(`[PAYMENT_HOOK] Payment refunded for order ${orderId}`);
}
