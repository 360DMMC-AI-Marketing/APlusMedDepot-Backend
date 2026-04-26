-- 035_backfill_payment_status.sql
-- Belt-and-suspenders: backfill any legacy 'succeeded' values to 'paid'.
-- Migration 020 already swapped the orders.payment_status CHECK constraint to
-- the {pending,processing,paid,failed,refunded,partially_refunded} set, so any
-- 'succeeded' rows would already block that constraint change. This UPDATE is
-- safe to re-run (idempotent) and protects against any data drift between
-- environments.

UPDATE orders
SET payment_status = 'paid'
WHERE payment_status = 'succeeded';

-- The payments.status column intentionally retains Stripe-native values
-- ('succeeded' is the Stripe API string) and is NOT migrated.
