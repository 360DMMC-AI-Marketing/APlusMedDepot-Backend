/**
 * Stub for multi-supplier order splitting.
 * Dev 2 will implement this in Sprint 3 to:
 * 1. Group order_items by supplier_id
 * 2. Create supplier-specific sub-order records
 * 3. Calculate per-supplier commission
 * 4. Send supplier notification emails
 *
 * @param orderId - The master order ID to split
 * @returns void (mutates order_items and creates commission records)
 */
export async function splitOrderBySupplier(_orderId: string): Promise<void> {
  // No-op stub — Dev 2 implements in Sprint 3
  console.log(`[ORDER_SPLIT_STUB] Order ${_orderId} — splitting not yet implemented`);
}
