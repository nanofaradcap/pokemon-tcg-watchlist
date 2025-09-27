-- Add merging fields to Card table
ALTER TABLE "Card" ADD COLUMN "mergedWith" TEXT;
ALTER TABLE "Card" ADD COLUMN "isMerged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Card" ADD COLUMN "mergeGroupId" TEXT;
