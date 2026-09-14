-- AlterTable
ALTER TABLE "VideoSegment" ADD COLUMN "audioApiTaskId" TEXT;
ALTER TABLE "VideoSegment" ADD COLUMN "audioErrorMessage" TEXT;
ALTER TABLE "VideoSegment" ADD COLUMN "audioNegativePrompt" TEXT;
ALTER TABLE "VideoSegment" ADD COLUMN "audioPrompt" TEXT;
ALTER TABLE "VideoSegment" ADD COLUMN "audioStatus" TEXT;
ALTER TABLE "VideoSegment" ADD COLUMN "audioUpdatedAt" DATETIME;
