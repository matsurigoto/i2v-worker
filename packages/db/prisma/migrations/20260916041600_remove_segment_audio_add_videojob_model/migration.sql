/*
  Warnings:

  - You are about to drop the column `audioApiTaskId` on the `VideoSegment` table. All the data in the column will be lost.
  - You are about to drop the column `audioErrorMessage` on the `VideoSegment` table. All the data in the column will be lost.
  - You are about to drop the column `audioNegativePrompt` on the `VideoSegment` table. All the data in the column will be lost.
  - You are about to drop the column `audioPrompt` on the `VideoSegment` table. All the data in the column will be lost.
  - You are about to drop the column `audioStatus` on the `VideoSegment` table. All the data in the column will be lost.
  - You are about to drop the column `audioUpdatedAt` on the `VideoSegment` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "VideoJob" ADD COLUMN "model" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VideoSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoJobId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "apiTaskId" TEXT,
    "storageKey" TEXT,
    "thumbnailKey" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoSegment_videoJobId_fkey" FOREIGN KEY ("videoJobId") REFERENCES "VideoJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VideoSegment" ("apiTaskId", "createdAt", "errorMessage", "id", "seq", "status", "storageKey", "thumbnailKey", "updatedAt", "videoJobId") SELECT "apiTaskId", "createdAt", "errorMessage", "id", "seq", "status", "storageKey", "thumbnailKey", "updatedAt", "videoJobId" FROM "VideoSegment";
DROP TABLE "VideoSegment";
ALTER TABLE "new_VideoSegment" RENAME TO "VideoSegment";
CREATE INDEX "VideoSegment_videoJobId_idx" ON "VideoSegment"("videoJobId");
CREATE UNIQUE INDEX "VideoSegment_videoJobId_seq_key" ON "VideoSegment"("videoJobId", "seq");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
