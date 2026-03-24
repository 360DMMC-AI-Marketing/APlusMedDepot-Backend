import { CommissionService } from "../commission.service";

export async function onPaymentSuccess(orderId: string): Promise<void> {
  try {
    await CommissionService.calculateOrderCommissions(orderId);
    console.log(`[COMMISSION] Calculated for order ${orderId}`);
  } catch (error) {
    console.error(`[COMMISSION] Calculation failed for order ${orderId}:`, error);
    // Don't throw — payment is already confirmed. Commission can be retried manually.
  }
}

export async function onPaymentRefunded(orderId: string): Promise<void> {
  try {
    await CommissionService.reverseOrderCommissions(orderId);
    console.log(`[COMMISSION] Reversed for order ${orderId}`);
  } catch (error) {
    console.error(`[COMMISSION] Reversal failed for order ${orderId}:`, error);
  }
}
