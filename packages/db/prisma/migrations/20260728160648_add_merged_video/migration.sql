-- CreateTable
CREATE TABLE "MergedVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "videoJobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "storageKey" TEXT,
    "thumbnailKey" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MergedVideo_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MergedVideo_videoJobId_fkey" FOREIGN KEY ("videoJobId") REFERENCES "VideoJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QueueMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoJobId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'video-job',
    "mergedVideoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibleAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dequeueCount" INTEGER NOT NULL DEFAULT 0,
    "processed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_QueueMessage" ("createdAt", "dequeueCount", "id", "processed", "videoJobId", "visibleAt") SELECT "createdAt", "dequeueCount", "id", "processed", "videoJobId", "visibleAt" FROM "QueueMessage";
DROP TABLE "QueueMessage";
ALTER TABLE "new_QueueMessage" RENAME TO "QueueMessage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MergedVideo_storyId_idx" ON "MergedVideo"("storyId");

-- CreateIndex
CREATE INDEX "MergedVideo_videoJobId_idx" ON "MergedVideo"("videoJobId");
