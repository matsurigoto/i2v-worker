import type { PrismaClient } from "@i2v/db";
import {
  BlobStorage,
  PaasApiClient,
  SEGMENT_COUNT,
} from "@i2v/shared";
import { extractFirstFrame, extractLastFrame } from "./frameExtractor";
import { downloadToBuffer } from "./download";
import { bufferToDataUrl } from "./imagePayload";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

export interface SegmentProcessorDeps {
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
 * Drives the full 7-segment "video relay" (影片接龍) for a single VideoJob:
 *
 *   segment 1  = image-to-video(story.sourceImage, prompt[0])
 *   segment N  = image-to-video(lastFrame(segment N-1's video), prompt[N-1])
 *
 * Each segment is created via the PAAS API, long-polled to completion,
 * downloaded, and persisted to blob storage. If a segment fails, the chain
 * stops and the VideoJob is marked "failed" (if segment 1) or "partial"
 * (if a later segment already succeeded).
 */
export async function runVideoJob(
  deps: SegmentProcessorDeps,
  videoJobId: string,
): Promise<void> {
  const { prisma, storage, paasClient } = deps;

  // eslint-disable-next-line no-console
  console.log(`[worker] [job ${videoJobId}] loading job, story prompts and source image`);
  const job = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    include: { story: { include: { prompts: true } }, sourceImage: true },
  });
  if (!job) {
    throw new Error(`VideoJob ${videoJobId} not found`);
  }
  if (!job.sourceImage) {
    await prisma.videoJob.update({
      where: { id: job.id },
      data: { status: "failed" },
    });
    throw new Error(`VideoJob ${videoJobId} has no source image (it may have been deleted)`);
  }

  const prompts = new Array<string>(SEGMENT_COUNT).fill("");
  for (const p of job.story.prompts) {
    if (p.seq >= 1 && p.seq <= SEGMENT_COUNT) prompts[p.seq - 1] = p.content;
  }
  if (prompts.some((p) => !p)) {
    await prisma.videoJob.update({ where: { id: job.id }, data: { status: "failed" } });
    throw new Error(`Story ${job.storyId} does not have ${SEGMENT_COUNT} prompts`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[worker] [job ${videoJobId}] downloading source image from storage key "${job.sourceImage.storageKey}"`,
  );
  let currentImageBuffer = await storage.get(job.sourceImage.storageKey);
  let currentContentType = job.sourceImage.contentType;
  let anySucceeded = false;

  for (let seq = 1; seq <= SEGMENT_COUNT; seq += 1) {
    const segmentStartedAt = Date.now();
    // eslint-disable-next-line no-console
    console.log(`[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: starting`);
    const segment = await prisma.videoSegment.upsert({
      where: { videoJobId_seq: { videoJobId: job.id, seq } },
      update: { status: "processing", errorMessage: null },
      create: { videoJobId: job.id, seq, status: "processing" },
    });

    try {
      const imagePayload = bufferToDataUrl(currentImageBuffer, currentContentType);
      // eslint-disable-next-line no-console
      console.log(
        `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: creating PAAS image-to-video task`,
      );
      const taskParams = {
        image: imagePayload,
        prompt: prompts[seq - 1],
        model: deps.imageToVideoDefaults?.model,
        fps: deps.imageToVideoDefaults?.fps,
        numFrames: deps.imageToVideoDefaults?.numFrames,
        resolution: deps.imageToVideoDefaults?.resolution,
      };
      // eslint-disable-next-line no-console
      console.log(
        `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: PAAS task params:`,
        JSON.stringify({ ...taskParams, image: taskParams.image.slice(0, 80) + "..." }),
      );
      const { id: apiTaskId } = await paasClient.createImageToVideoTask(taskParams);
      // eslint-disable-next-line no-console
      console.log(
        `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: created PAAS task ${apiTaskId}, polling for completion`,
      );

      await prisma.videoSegment.update({
        where: { id: segment.id },
        data: { apiTaskId },
      });

      const task = await paasClient.pollTaskUntilDone(apiTaskId, {
        intervalMs: deps.pollIntervalMs,
        timeoutMs: deps.pollTimeoutMs,
        onPoll: (polled) => {
          // eslint-disable-next-line no-console
          console.log(
            `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: PAAS task ${apiTaskId} status=${polled.status}`,
          );
        },
      });

      const videoUrl = task.results?.data?.video?.url;
      if (!videoUrl) {
        throw new Error(`PAAS task ${apiTaskId} completed without a video URL`);
      }

      // eslint-disable-next-line no-console
      console.log(
        `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: PAAS task ${apiTaskId} completed, downloading video from ${videoUrl}`,
      );
      const videoBuffer = await downloadToBuffer(videoUrl);
      const videoStorageKey = `videos/${job.id}/${seq}.mp4`;
      // eslint-disable-next-line no-console
      console.log(
        `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: uploading video (${formatBytes(videoBuffer.length)}) to "${videoStorageKey}"`,
      );
      await storage.put(videoStorageKey, videoBuffer, "video/mp4");

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-segment-"));
      const tmpVideoPath = path.join(tmpDir, "segment.mp4");
      try {
        await fs.writeFile(tmpVideoPath, videoBuffer);
        // eslint-disable-next-line no-console
        console.log(
          `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: extracting thumbnail and last frame`,
        );
        const [thumbnailBuffer, lastFrameBuffer] = await Promise.all([
          extractFirstFrame(tmpVideoPath),
          extractLastFrame(tmpVideoPath),
        ]);

        const thumbnailStorageKey = `videos/${job.id}/${seq}-thumb.png`;
        await storage.put(thumbnailStorageKey, thumbnailBuffer, "image/png");

        await prisma.videoSegment.update({
          where: { id: segment.id },
          data: {
            status: "completed",
            storageKey: videoStorageKey,
            thumbnailKey: thumbnailStorageKey,
          },
        });

        currentImageBuffer = lastFrameBuffer;
        currentContentType = "image/png";
        anySucceeded = true;
        // eslint-disable-next-line no-console
        console.log(
          `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: completed in ${Date.now() - segmentStartedAt}ms`,
        );
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[worker] [job ${videoJobId}] segment ${seq}/${SEGMENT_COUNT}: failed after ${Date.now() - segmentStartedAt}ms:`,
        err,
      );
      await prisma.videoSegment.update({
        where: { id: segment.id },
        data: { status: "failed", errorMessage: message },
      });
      await prisma.videoJob.update({
        where: { id: job.id },
        data: { status: anySucceeded ? "partial" : "failed" },
      });
      // eslint-disable-next-line no-console
      console.log(
        `[worker] [job ${videoJobId}] marked as ${anySucceeded ? "partial" : "failed"} due to segment ${seq} failure`,
      );
      return;
    }
  }

  await prisma.videoJob.update({ where: { id: job.id }, data: { status: "completed" } });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
