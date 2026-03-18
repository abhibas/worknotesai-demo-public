-- AlterTable
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "summaryFeedback" TEXT,
ADD COLUMN IF NOT EXISTS "detailedFeedback" TEXT,
ADD COLUMN IF NOT EXISTS "rubricScores" TEXT,
ADD COLUMN IF NOT EXISTS "topStrengths" TEXT,
ADD COLUMN IF NOT EXISTS "improvementAreas" TEXT,
ADD COLUMN IF NOT EXISTS "rubricDiagnosticSummary" TEXT,
ADD COLUMN IF NOT EXISTS "skillsHighlighted" TEXT;
