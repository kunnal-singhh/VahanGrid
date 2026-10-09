-- 022_add_user_roles_and_cpo_association.sql
-- Phase 4A.1: Operator Identity and Authorization Foundation
--
-- Adds role-based access control and CPO organizational association to the users table.
--
-- Security:
-- - Default role is 'driver' so all existing users and standard public registrations
--   default to safe, unprivileged driver status.
-- - role is strictly constrained to ('driver', 'operator', 'admin').
-- - cpo_id references cpos(id) with ON DELETE SET NULL.
-- - Operator authorization fails closed if an operator account has no associated cpo_id.
-- - Existing users remain untouched with role='driver' and cpo_id=NULL.

-- 1. Add role and cpo_id columns to users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'driver',
  ADD COLUMN IF NOT EXISTS cpo_id UUID REFERENCES cpos(id) ON DELETE SET NULL;

-- 2. Check constraint for valid roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_role'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_user_role
      CHECK (role IN ('driver', 'operator', 'admin'));
  END IF;
END $$;

-- 3. Indexes for performant role lookups and CPO tenant filtering
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_cpo_id ON users(cpo_id);
