import type { PrismaClient } from "@i2v/db";
import { BlobStorage, PaasApiClient, SEGMENT_COUNT } from "@i2v/shared";
import { extractLastFrame } from "./frameExtractor";
import { bufferToDataUrl } from "./imagePayload";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export interface SegmentRegeneratorDeps {
  prisma: PrismaClient;
  storage: BlobStorage;
  paasClient: PaasApiClient;
  pollIntervalMs: number;
  pollTimeoutMs: number;
  imageToVideoDefaults?: {
    model?: string;
    fps?: number;
    numFrames?: number;
    resolution?: string;
  };
}

/**
 * Re-generates a single VideoSegment in isolation:
 *
 *   seq === 1 → uses the job's original source image
 *   seq > 1   → uses the last frame of the completed segment (seq - 1)
 *
 * After completion the VideoJob status is recomputed from all segment statuses.
 */
export async function regenerateSegment(
  deps: SegmentRegeneratorDeps,
  videoJobId: string,
  seq: number,
): Promise<void> {
  const { prisma, storage, paasClient } = deps;

  if (seq < 1 || seq > SEGMENT_COUNT) {
    throw new Error(`seq must be between 1 and ${SEGMENT_COUNT}, got ${seq}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[worker] [regen ${videoJobId}] seq=${seq}: loading job`);

  const job = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    include: {
      story: { include: { prompts: true } },
      sourceImage: true,
      segments: true,
    },
  });
  if (!job) throw new Error(`VideoJob ${videoJobId} not found`);

  // Resolve the prompt for this segment from the story.
  const promptRow = job.story.prompts.find((p) => p.seq === seq);
  if (!promptRow?.content) {
    await prisma.videoJob.update({ where: { id: job.id }, data: { status: "failed" } });
    throw new Error(`Story ${job.storyId} has no prompt for seq ${seq}`);
  }
  const prompt = promptRow.content;

  // Resolve the input image buffer.
  let imageBuffer: Buffer;
  let contentType: string;

  if (seq === 1) {
    if (!job.sourceImage) {
      await prisma.videoJob.update({ where: { id: job.id }, data: { status: "failed" } });
      throw new Error(`VideoJob ${videoJobId} has no source image`);
    }
    // eslint-disable-next-line no-console
    console.log(
      `[worker] [regen ${videoJobId}] seq=1: downloading source image "${job.sourceImage.storageKey}"`,
    );
    imageBuffer = await storage.get(job.sourceImage.storageKey);
    contentType = job.sourceImage.contentType;
  } else {
    const prevSegment = job.segments.find((s) => s.seq === seq - 1);
    if (!prevSegment?.storageKey) {
      throw new Error(
        `Cannot regenerate seq ${seq}: previous segment (seq ${seq - 1}) has no video in storage`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[worker] [regen ${videoJobId}] seq=${seq}: extracting last frame of segment ${seq - 1}`,
    );
    const prevVideoBuffer = await storage.get(prevSegment.storageKey);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-regen-prev-"));
    const tmpVideoPath = path.join(tmpDir, "prev.mp4");
    try {
      await fs.writeFile(tmpVideoPath, prevVideoBuffer);
      imageBuffer = await extractLastFrame(tmpVideoPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
    contentType = "image/png";
  }

  // Mark segment as processing.
  const segment = await prisma.videoSegment.upsert({
    where: { videoJobId_seq: { videoJobId: job.id, seq } },
    update: { status: "processing", errorMessage: null },
    create: { videoJobId: job.id, seq, status: "processing" },
  });

  const segmentStartedAt = Date.now();
  try {
    const imagePayload = bufferToDataUrl(imageBuffer, contentType);
    // eslint-disable-next-line no-console
    console.log(
      `[worker] [regen ${videoJobId}] seq=${seq}: creating PAAS image-to-video task`,
    );
    const { id: apiTaskId } = await paasClient.createImageToVideoTask({
      image: imagePayload,
      prompt,
      model: deps.imageToVideoDefaults?.model,
      fps: deps.imageToVideoDefaults?.fps,
      numFrames: deps.imageToVideoDefaults?.numFrames,
      resolution: deps.imageToVideoDefaults?.resolution,
    });

    await prisma.videoSegment.update({ where: { id: segment.id }, data: { apiTaskId } });

    // eslint-disable-next-line no-console
    console.log(
      `[worker] [regen ${videoJobId}] seq=${seq}: PAAS task ${apiTaskId}, polling…`,
    );
    const task = await paasClient.pollTaskUntilDone(apiTaskId, {
      intervalMs: deps.pollIntervalMs,
      timeoutMs: deps.pollTimeoutMs,
      onPoll: (polled) => {
        // eslint-disable-next-line no-console
        console.log(
          `[worker] [regen ${videoJobId}] seq=${seq}: PAAS task ${apiTaskId} status=${polled.status}`,
        );
      },
    });

    const videoUrl = task.results?.data?.video?.url;
    if (!videoUrl) throw new Error(`PAAS task ${apiTaskId} completed without a video URL`);

    // eslint-disable-next-line no-console
    console.log(
      `[worker] [regen ${videoJobId}] seq=${seq}: downloading video from ${videoUrl}`,
    );
    const { downloadToBuffer } = await import("./download");
    const videoBuffer = await downloadToBuffer(videoUrl);
    const videoStorageKey = `videos/${job.id}/${seq}.mp4`;
    await storage.put(videoStorageKey, videoBuffer, "video/mp4");

    // Extract thumbnail.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-regen-"));
    const tmpVideoPath = path.join(tmpDir, "segment.mp4");
    let thumbnailBuffer: Buffer;
    try {
      await fs.writeFile(tmpVideoPath, videoBuffer);
      const { extractFirstFrame } = await import("./frameExtractor");
      thumbnailBuffer = await extractFirstFrame(tmpVideoPath);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    const thumbnailStorageKey = `videos/${job.id}/${seq}-thumb.png`;
    await storage.put(thumbnailStorageKey, thumbnailBuffer, "image/png");

    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: { status: "completed", storageKey: videoStorageKey, thumbnailKey: thumbnailStorageKey },
    });

    // eslint-disable-next-line no-console
    console.log(
      `[worker] [regen ${videoJobId}] seq=${seq}: completed in ${Date.now() - segmentStartedAt}ms`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[worker] [regen ${videoJobId}] seq=${seq}: failed after ${Date.now() - segmentStartedAt}ms:`,
      err,
    );
    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: { status: "failed", errorMessage: message },
    });
    await recomputeJobStatus(prisma, job.id);
    return;
  }

  await recomputeJobStatus(prisma, job.id);
}

async function recomputeJobStatus(prisma: PrismaClient, jobId: string): Promise<void> {
  const segments = await prisma.videoSegment.findMany({ where: { videoJobId: jobId } });
  const allCompleted = segments.length === SEGMENT_COUNT && segments.every((s) => s.status === "completed");
  const anyCompleted = segments.some((s) => s.status === "completed");
  const anyRunning = segments.some((s) => s.status === "processing" || s.status === "pending");

  let status: string;
  if (anyRunning) {
    status = "running";
  } else if (allCompleted) {
    status = "completed";
  } else if (anyCompleted) {
    status = "partial";
  } else {
    status = "failed";
  }

  await prisma.videoJob.update({ where: { id: jobId }, data: { status } });
}
