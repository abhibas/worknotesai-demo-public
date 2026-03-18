-- AlterTable
-- Add score and sectionScores columns to Response table
-- These columns were missing from previous migrations

ALTER TABLE "Response" 
ADD COLUMN IF NOT EXISTS "score" TEXT,
ADD COLUMN IF NOT EXISTS "sectionScores" TEXT;

