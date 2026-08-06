-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QueueMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoJobId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'video-job',
    "mergedVideoId" TEXT,
    "segmentSeq" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibleAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dequeueCount" INTEGER NOT NULL DEFAULT 0,
    "processed" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_QueueMessage" ("createdAt", "dequeueCount", "id", "mergedVideoId", "processed", "type", "videoJobId", "visibleAt") SELECT "createdAt", "dequeueCount", "id", "mergedVideoId", "processed", "type", "videoJobId", "visibleAt" FROM "QueueMessage";
DROP TABLE "QueueMessage";
ALTER TABLE "new_QueueMessage" RENAME TO "QueueMessage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
