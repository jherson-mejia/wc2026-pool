-- Add penalty shootout score columns to results table
-- Run in Supabase SQL editor: https://app.supabase.com → SQL Editor

ALTER TABLE results
  ADD COLUMN IF NOT EXISTS home_pens INT,
  ADD COLUMN IF NOT EXISTS away_pens INT;
