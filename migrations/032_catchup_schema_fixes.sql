-- ============================================================
-- Migration 032: Catch-Up Schema Fixes
-- ============================================================
-- Brings a fresh Supabase instance (that has run migrations 001-020)
-- up to match the actual state of the production database.
--
-- Migrations 021-031 were NEVER applied to the live database.
-- This migration captures the 2 manual changes made via Supabase
-- dashboard that are NOT covered by any existing migration file.
-- ============================================================

-- GAP: users table has a service_role bypass RLS policy not in any migration
-- Likely added via Supabase dashboard to allow service_role key to manage users
-- (e.g., admin approval workflows, auth flows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'service_role_bypass'
  ) THEN
    CREATE POLICY service_role_bypass ON users FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- GAP: suppliers table has a service_role bypass RLS policy not in any migration
-- Likely added via Supabase dashboard to allow service_role key to manage suppliers
-- (e.g., commission payouts, balance updates, admin approval)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'suppliers_service_all'
  ) THEN
    CREATE POLICY suppliers_service_all ON suppliers FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- GAP: users.password_hash is nullable in live DB but NOT NULL in migration 001
-- Likely changed to support OAuth/SSO flows where password is not required
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
