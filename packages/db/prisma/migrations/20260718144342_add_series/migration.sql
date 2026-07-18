-- CreateTable
CREATE TABLE "Series" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "seriesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Story_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Prompt_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storyId" TEXT NOT NULL,
    "sourceImageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoJob_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VideoJob_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "ImageAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VideoSegment" (
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

-- CreateTable
CREATE TABLE "QueueMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "videoJobId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibleAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dequeueCount" INTEGER NOT NULL DEFAULT 0,
    "processed" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE INDEX "Story_seriesId_idx" ON "Story"("seriesId");

-- CreateIndex
CREATE INDEX "Prompt_storyId_idx" ON "Prompt"("storyId");

-- CreateIndex
CREATE UNIQUE INDEX "Prompt_storyId_seq_key" ON "Prompt"("storyId", "seq");

-- CreateIndex
CREATE INDEX "VideoJob_storyId_idx" ON "VideoJob"("storyId");

-- CreateIndex
CREATE INDEX "VideoSegment_videoJobId_idx" ON "VideoSegment"("videoJobId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSegment_videoJobId_seq_key" ON "VideoSegment"("videoJobId", "seq");
