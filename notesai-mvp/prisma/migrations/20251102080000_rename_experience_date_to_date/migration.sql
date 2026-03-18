-- Comprehensive migration: Add all missing columns to Experience table
-- This handles schema mismatches between Prisma schema and production database
DO $$ 
BEGIN
  -- Fix date column (rename experienceDate to date if needed)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'experienceDate'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'date'
  ) THEN
    ALTER TABLE "Experience" RENAME COLUMN "experienceDate" TO "date";
  END IF;
  
  -- Add date column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'date'
  ) THEN
    ALTER TABLE "Experience" ADD COLUMN "date" TEXT;
  END IF;
  
  -- Add experienceTitle column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'experienceTitle'
  ) THEN
    ALTER TABLE "Experience" ADD COLUMN "experienceTitle" TEXT;
  END IF;
  
  -- Add company column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'company'
  ) THEN
    ALTER TABLE "Experience" ADD COLUMN "company" TEXT;
  END IF;
  
  -- Add role column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'role'
  ) THEN
    ALTER TABLE "Experience" ADD COLUMN "role" TEXT;
  END IF;
  
  -- Add project column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Experience' AND column_name = 'project'
  ) THEN
    ALTER TABLE "Experience" ADD COLUMN "project" TEXT;
  END IF;
END $$;

