import type { PrismaClient } from "@i2v/db";
import { BlobStorage, PaasApiClient } from "@i2v/shared";

export interface SegmentAudioDubberDeps {
  prisma: PrismaClient;
  storage: BlobStorage;
  paasClient: PaasApiClient;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}

/**
 * Dubs audio onto an already-generated VideoSegment via the PAAS
 * `sound-on-video` task, overwriting the video at `storageKey` in place
 * (there is no separate silent copy kept after a successful dub).
 *
 * Failures only affect the segment's `audio*` fields; they never change
 * `VideoSegment.status` or `VideoJob.status`, since the underlying (silent)
 * video is unaffected by a failed dub attempt.
 */
export async function dubSegmentAudio(
  deps: SegmentAudioDubberDeps,
  videoJobId: string,
  seq: number,
): Promise<void> {
  const { prisma, storage, paasClient } = deps;

  const segment = await prisma.videoSegment.findFirst({
    where: { videoJobId, seq },
  });
  if (!segment) throw new Error(`VideoSegment not found for VideoJob ${videoJobId} seq ${seq}`);
  if (!segment.storageKey) {
    throw new Error(`VideoSegment ${videoJobId}/${seq} has no video to dub`);
  }

  await prisma.videoSegment.update({
    where: { id: segment.id },
    data: { audioStatus: "processing" },
  });

  const startedAt = Date.now();
  try {
    // sound-on-video only downloads a fetchable URL (unlike image-to-video's
    // `image` field, it rejects base64 data URIs), so hand PAAS a signed URL
    // instead of embedding the video bytes.
    // eslint-disable-next-line no-console
    console.log(`[worker] [dub ${videoJobId}] seq=${seq}: resolving downloadable video URL`);
    const videoUrl = await storage.getDownloadUrl(segment.storageKey);

    // eslint-disable-next-line no-console
    console.log(`[worker] [dub ${videoJobId}] seq=${seq}: creating PAAS sound-on-video task`);
    const { id: apiTaskId } = await paasClient.createSoundOnVideoTask({
      video: videoUrl,
      prompt: segment.audioPrompt ?? undefined,
      negativePrompt: segment.audioNegativePrompt ?? undefined,
    });

    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: { audioApiTaskId: apiTaskId },
    });

    // eslint-disable-next-line no-console
    console.log(`[worker] [dub ${videoJobId}] seq=${seq}: PAAS task ${apiTaskId}, polling…`);
    const task = await paasClient.pollTaskUntilDone(apiTaskId, {
      intervalMs: deps.pollIntervalMs,
      timeoutMs: deps.pollTimeoutMs,
      onPoll: (polled) => {
        // eslint-disable-next-line no-console
        console.log(
          `[worker] [dub ${videoJobId}] seq=${seq}: PAAS task ${apiTaskId} status=${polled.status}`,
        );
      },
    });

    const dubbedVideoUrl = task.results?.data?.video?.url;
    if (!dubbedVideoUrl) throw new Error(`PAAS task ${apiTaskId} completed without a video URL`);

    // eslint-disable-next-line no-console
    console.log(`[worker] [dub ${videoJobId}] seq=${seq}: downloading dubbed video from ${dubbedVideoUrl}`);
    const { downloadToBuffer } = await import("./download");
    const dubbedVideoBuffer = await downloadToBuffer(dubbedVideoUrl);
    await storage.put(segment.storageKey, dubbedVideoBuffer, "video/mp4");

    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: { audioStatus: "completed", audioErrorMessage: null, audioUpdatedAt: new Date() },
    });

    // eslint-disable-next-line no-console
    console.log(`[worker] [dub ${videoJobId}] seq=${seq}: completed in ${Date.now() - startedAt}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[worker] [dub ${videoJobId}] seq=${seq}: failed after ${Date.now() - startedAt}ms:`,
      err,
    );
    await prisma.videoSegment.update({
      where: { id: segment.id },
      data: { audioStatus: "failed", audioErrorMessage: message, audioUpdatedAt: new Date() },
    });
  }
}
