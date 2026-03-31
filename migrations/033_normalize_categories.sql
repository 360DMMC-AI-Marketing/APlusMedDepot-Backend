-- Migration 032: Normalize product categories to the approved list
-- Official categories: Wound Care, Vascular Access, Incontinence Care, Gloves,
-- Nursing Care Supplies, Enteral Feeding Tubes, Skin Biologics, Advanced Wound Care,
-- PPE (Personal Protective Equipment), Central Supply, DME (Durable Medical Equipment)

-- Map old frontend categories to new ones where possible
UPDATE products SET category = 'PPE (Personal Protective Equipment)' WHERE category = 'Personal Protection';
UPDATE products SET category = 'Nursing Care Supplies' WHERE category = 'Patient Care';
UPDATE products SET category = 'DME (Durable Medical Equipment)' WHERE category = 'Diagnostic Equipment';
UPDATE products SET category = 'Nursing Care Supplies' WHERE category = 'Nursing Care Supplies';

-- Normalize common variations
UPDATE products SET category = 'Wound Care' WHERE LOWER(category) LIKE '%wound care%' AND category != 'Wound Care' AND LOWER(category) NOT LIKE '%advanced%';
UPDATE products SET category = 'Advanced Wound Care' WHERE LOWER(category) LIKE '%advanced wound%' AND category != 'Advanced Wound Care';
UPDATE products SET category = 'Vascular Access' WHERE LOWER(category) LIKE '%vascular%' AND category != 'Vascular Access';
UPDATE products SET category = 'Incontinence Care' WHERE LOWER(category) LIKE '%incontinence%' AND category != 'Incontinence Care';
UPDATE products SET category = 'Gloves' WHERE LOWER(category) LIKE '%glove%' AND category != 'Gloves';
UPDATE products SET category = 'Enteral Feeding Tubes' WHERE (LOWER(category) LIKE '%enteral%' OR LOWER(category) LIKE '%feeding tube%') AND category != 'Enteral Feeding Tubes';
UPDATE products SET category = 'Skin Biologics' WHERE LOWER(category) LIKE '%skin biologic%' AND category != 'Skin Biologics';
UPDATE products SET category = 'PPE (Personal Protective Equipment)' WHERE (LOWER(category) LIKE '%ppe%' OR LOWER(category) LIKE '%personal protective%') AND category != 'PPE (Personal Protective Equipment)';
UPDATE products SET category = 'Central Supply' WHERE LOWER(category) LIKE '%central supply%' AND category != 'Central Supply';
UPDATE products SET category = 'DME (Durable Medical Equipment)' WHERE (LOWER(category) LIKE '%dme%' OR LOWER(category) LIKE '%durable medical%') AND category != 'DME (Durable Medical Equipment)';

-- Nullify any remaining non-standard categories
UPDATE products SET category = NULL WHERE category IS NOT NULL AND category NOT IN (
  'Wound Care', 'Vascular Access', 'Incontinence Care', 'Gloves',
  'Nursing Care Supplies', 'Enteral Feeding Tubes', 'Skin Biologics',
  'Advanced Wound Care', 'PPE (Personal Protective Equipment)',
  'Central Supply', 'DME (Durable Medical Equipment)'
);
