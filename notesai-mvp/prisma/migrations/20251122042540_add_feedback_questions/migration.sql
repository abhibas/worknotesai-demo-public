/*
  Warnings:

  - Added the required column `updatedAt` to the `Response` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- Step 1: Add updatedAt column as nullable first
ALTER TABLE "Response" ADD COLUMN "updatedAt" TIMESTAMP(3);
-- Step 2: Update existing records to use createdAt value
UPDATE "Response" SET "updatedAt" = "createdAt";
-- Step 3: Make updatedAt NOT NULL (now that all rows have values)
ALTER TABLE "Response" ALTER COLUMN "updatedAt" SET NOT NULL;
-- Step 4: Add feedbackQuestions column (nullable)
ALTER TABLE "Response" ADD COLUMN "feedbackQuestions" TEXT;
