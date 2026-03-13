# Known Limitations

## Per-Category Commission Rates

The SOW specifies "Commission calculation engine (configurable by supplier/category)."
Current implementation supports per-supplier commission rates only.
Per-category rates (e.g., 18% for premium categories) are NOT implemented.

Rate resolution currently:
1. If supplier has custom rate -> use it
2. Else -> use platform default (15%)

To add per-category rates in the future:
1. Create a `category_commission_rates` table: category (string), rate (numeric)
2. Update `CommissionService.calculateOrderCommissions()` to check category rate first
3. Rate resolution hierarchy: category rate > supplier rate > platform default

## Early Payout with Fee

The SOW mentions early payout with a 2.5% fee for suppliers who want funds before the standard payout cycle. This is not implemented. Currently, payouts are created manually by admins via `POST /api/admin/payouts` with no early-payout fee logic.

## PDF Invoice Generation

PDF invoice generation for payouts is mentioned in documentation but not implemented. The system creates invoice records in the database (for Net30 orders) but does not generate downloadable PDF files.

## Partial Refund Commission Handling

Only full refund commission reversal is implemented via `CommissionService.reverseOrderCommissions()`. Partial refunds (e.g., refunding 1 of 3 items) will reverse ALL commissions for the order, not just the refunded items. The Stripe webhook handler for `charge.refunded` triggers a full reversal regardless of refund amount.
