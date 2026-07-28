import { Router } from "express";
import { getPrismaClient } from "@i2v/db";
import type { MergedVideo } from "@i2v/shared";
import { storage } from "../storage";

export const mergedVideosRouter = Router();

const prisma = getPrismaClient();

function toDto(row: {
  id: string;
  storyId: string;
  videoJobId: string;
  name: string;
  status: string;
  storageKey: string | null;
  thumbnailKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MergedVideo {
  return {
    id: row.id,
    storyId: row.storyId,
    videoJobId: row.videoJobId,
    name: row.name,
    status: row.status as MergedVideo["status"],
    videoUrl: row.storageKey ? storage.urlFor(row.storageKey) : null,
    thumbnailUrl: row.thumbnailKey ? storage.urlFor(row.thumbnailKey) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** GET /api/merged-videos — list merged videos with pagination and story-name search */
mergedVideosRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 24));
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where = q
    ? { status: "completed" as const, story: { name: { contains: q } } }
    : { status: "completed" as const };

  const [items, total] = await Promise.all([
    prisma.mergedVideo.findMany({
      where,
      include: { story: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.mergedVideo.count({ where }),
  ]);

  res.json({
    items: items.map(toDto),
    total,
    page,
    pageSize,
  });
});

/** GET /api/merged-videos/:id */
mergedVideosRouter.get("/:id", async (req, res) => {
  const row = await prisma.mergedVideo.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Merged video not found" });
    return;
  }
  res.json(toDto(row));
});

/** DELETE /api/merged-videos/:id */
mergedVideosRouter.delete("/:id", async (req, res) => {
  const row = await prisma.mergedVideo.findUnique({ where: { id: req.params.id } });
  if (!row) {
    res.status(404).json({ error: "Merged video not found" });
    return;
  }
  if (row.storageKey) await storage.delete(row.storageKey);
  if (row.thumbnailKey) await storage.delete(row.thumbnailKey);
  await prisma.mergedVideo.delete({ where: { id: row.id } });
  res.status(204).send();
});
