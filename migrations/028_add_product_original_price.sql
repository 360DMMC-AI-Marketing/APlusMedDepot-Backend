-- Add original_price column to products
-- original_price is nullable. null means no discount (regular price).
-- When set, original_price is the "was" price and price is the current selling price.
ALTER TABLE products ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2) DEFAULT NULL;
