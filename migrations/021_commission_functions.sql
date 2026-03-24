-- 021_commission_functions.sql
-- Add 'reversed' status to commissions and create atomic balance update function

-- 1. Extend commissions status constraint to include 'reversed'
ALTER TABLE commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
ALTER TABLE commissions ADD CONSTRAINT commissions_status_check
  CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled', 'reversed'));

-- 2. Atomic supplier balance increment/decrement function
--    Positive amount = credit (commission earned)
--    Negative amount = debit (commission reversed)
--    GREATEST prevents balance going below 0
CREATE OR REPLACE FUNCTION increment_supplier_balance(
  p_supplier_id UUID,
  p_amount NUMERIC(12,2)
) RETURNS NUMERIC(12,2) AS $$
DECLARE
  new_balance NUMERIC(12,2);
BEGIN
  UPDATE suppliers
  SET current_balance = GREATEST(current_balance + p_amount, 0)
  WHERE id = p_supplier_id
  RETURNING current_balance INTO new_balance;
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql;
