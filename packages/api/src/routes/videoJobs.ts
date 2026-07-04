import { Router } from "express";
import { getPrismaClient } from "@i2v/db";
import { SEGMENT_COUNT, VideoJob, VideoSegment } from "@i2v/shared";
import { storage } from "../storage";

export const videoJobsRouter = Router();
export const storyVideoJobsRouter = Router({ mergeParams: true });

const prisma = getPrismaClient();

type SegmentRow = {
  id: string;
  videoJobId: string;
  seq: number;
  status: string;
  apiTaskId: string | null;
  storageKey: string | null;
  thumbnailKey: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSegmentDto(segment: SegmentRow): VideoSegment {
  return {
    id: segment.id,
    videoJobId: segment.videoJobId,
    seq: segment.seq,
    status: segment.status as VideoSegment["status"],
    apiTaskId: segment.apiTaskId,
    videoUrl: segment.storageKey ? storage.urlFor(segment.storageKey) : null,
    thumbnailUrl: segment.thumbnailKey ? storage.urlFor(segment.thumbnailKey) : null,
    errorMessage: segment.errorMessage,
    createdAt: segment.createdAt.toISOString(),
    updatedAt: segment.updatedAt.toISOString(),
  };
}

function toVideoJobDto(job: {
  id: string;
  storyId: string;
  sourceImageId: string | null;
  status: string;
  triggeredAt: Date;
  updatedAt: Date;
  segments: SegmentRow[];
}): VideoJob {
  // Always project a fixed-length array of SEGMENT_COUNT slots so the UI can
  // render empty placeholder cells for segments that never ran.
  const bySeq = new Map(job.segments.map((s) => [s.seq, s]));
  const segments: VideoSegment[] = [];
  for (let seq = 1; seq <= SEGMENT_COUNT; seq += 1) {
    const existing = bySeq.get(seq);
    segments.push(
      existing
        ? toSegmentDto(existing)
        : {
            id: `${job.id}-empty-${seq}`,
            videoJobId: job.id,
            seq,
            status: "pending",
            apiTaskId: null,
            videoUrl: null,
            thumbnailUrl: null,
            errorMessage: null,
            createdAt: job.triggeredAt.toISOString(),
            updatedAt: job.triggeredAt.toISOString(),
          },
    );
  }

  return {
    id: job.id,
    storyId: job.storyId,
    sourceImageId: job.sourceImageId ?? "",
    status: job.status as VideoJob["status"],
    triggeredAt: job.triggeredAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    segments,
  };
}

/** POST /api/stories/:storyId/videojobs - trigger a new 7-segment video chain */
storyVideoJobsRouter.post("/", async (req, res) => {
  const { storyId } = req.params as { storyId: string };
  const { imageId } = req.body ?? {};

  if (typeof imageId !== "string") {
    res.status(400).json({ error: "imageId is required" });
    return;
  }

  const [story, image] = await Promise.all([
    prisma.story.findUnique({ where: { id: storyId }, include: { prompts: true } }),
    prisma.imageAsset.findUnique({ where: { id: imageId } }),
  ]);
  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  if (story.prompts.length !== SEGMENT_COUNT) {
    res.status(422).json({
      error: `Story must have exactly ${SEGMENT_COUNT} prompts before generating video`,
    });
    return;
  }
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.videoJob.create({
      data: {
        storyId,
        sourceImageId: imageId,
        status: "running",
      },
    });
    // Enqueue: the worker picks this up and drives the 7-segment chain.
    await tx.queueMessage.create({ data: { videoJobId: created.id } });
    return created;
  });

  const withSegments = await prisma.videoJob.findUniqueOrThrow({
    where: { id: job.id },
    include: { segments: true },
  });
  res.status(201).json(toVideoJobDto(withSegments));
});

/** GET /api/stories/:storyId/videojobs - list all trigger batches ("rows") for a story */
storyVideoJobsRouter.get("/", async (req, res) => {
  const { storyId } = req.params as { storyId: string };
  const jobs = await prisma.videoJob.findMany({
    where: { storyId },
    include: { segments: true },
    orderBy: { triggeredAt: "desc" },
  });
  res.json({ items: jobs.map(toVideoJobDto) });
});

videoJobsRouter.get("/:id", async (req, res) => {
  const job = await prisma.videoJob.findUnique({
    where: { id: req.params.id },
    include: { segments: true },
  });
  if (!job) {
    res.status(404).json({ error: "Video job not found" });
    return;
  }
  res.json(toVideoJobDto(job));
});

videoJobsRouter.delete("/:id", async (req, res) => {
  const job = await prisma.videoJob.findUnique({
    where: { id: req.params.id },
    include: { segments: true },
  });
  if (!job) {
    res.status(404).json({ error: "Video job not found" });
    return;
  }
  for (const segment of job.segments) {
    if (segment.storageKey) await storage.delete(segment.storageKey);
    if (segment.thumbnailKey) await storage.delete(segment.thumbnailKey);
  }
  await prisma.videoJob.delete({ where: { id: job.id } });
  res.status(204).send();
});

videoJobsRouter.delete("/:jobId/segments/:seq", async (req, res) => {
  const seq = Number(req.params.seq);
  const segment = await prisma.videoSegment.findFirst({
    where: { videoJobId: req.params.jobId, seq },
  });
  if (!segment) {
    res.status(404).json({ error: "Video segment not found" });
    return;
  }
  if (segment.storageKey) await storage.delete(segment.storageKey);
  if (segment.thumbnailKey) await storage.delete(segment.thumbnailKey);
  await prisma.videoSegment.delete({ where: { id: segment.id } });
  res.status(204).send();
});
