-- 034_webhook_dedup_constraint.sql
-- Database-level deduplication for Stripe webhook events.
-- The in-memory Set in webhook.service.ts does not survive process restarts
-- and is not shared across multiple instances (e.g. ECS Fargate). This unique
-- partial index makes the payments table the source of truth: a duplicate
-- stripe_event_id INSERT raises 23505 unique_violation, which the service
-- treats as "already processed".

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_event_id_unique
  ON payments (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
