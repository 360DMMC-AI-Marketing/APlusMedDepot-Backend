-- ============================================
-- Migration 022: Add 'rejected' to users status constraint
-- ============================================
-- Extend users.status CHECK to include 'rejected' for admin user management.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('pending', 'approved', 'suspended', 'rejected'));
