import { getPrismaClient } from "@i2v/db";
import { createStorageFromEnv, PaasApiClient } from "@i2v/shared";
import { config } from "./config";
import { claimNextMessage } from "./queue";
import { runVideoJob } from "./segmentProcessor";
import { regenerateSegment } from "./segmentRegenerator";
import { mergeVideoSegments } from "./videoMerger";

const prisma = getPrismaClient();
const storage = createStorageFromEnv({
  driver: config.storageDriver,
  localRootDir: config.mediaRootDir,
  localPublicBasePath: config.mediaPublicBasePath,
  azureConnectionString: config.azureStorageConnectionString,
  azureContainerName: config.azureStorageContainerName,
});
const paasClient = new PaasApiClient({
  baseUrl: config.paasApiBaseUrl,
});

async function tick(): Promise<boolean> {
  const message = await claimNextMessage(prisma);
  if (!message) return false;

  const startedAt = Date.now();

  if (message.type === "regenerate-segment" && message.segmentSeq != null) {
    // eslint-disable-next-line no-console
    console.log(
      `[worker] regenerating segment seq=${message.segmentSeq} for VideoJob ${message.videoJobId} (queue message ${message.id})`,
    );
    try {
      await regenerateSegment(
        {
          prisma,
          storage,
          paasClient,
          pollIntervalMs: config.pollIntervalMs,
          pollTimeoutMs: config.pollTimeoutMs,
          imageToVideoDefaults: config.imageToVideo,
        },
        message.videoJobId,
        message.segmentSeq,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[worker] finished regenerating seq=${message.segmentSeq} for VideoJob ${message.videoJobId} in ${Date.now() - startedAt}ms`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[worker] regen seq=${message.segmentSeq} VideoJob ${message.videoJobId} failed after ${Date.now() - startedAt}ms:`,
        err,
      );
    }
    return true;
  }

  if (message.type === "merge-video" && message.mergedVideoId) {
    // eslint-disable-next-line no-console
    console.log(
      `[worker] merging video for MergedVideo ${message.mergedVideoId} (queue message ${message.id})`,
    );
    try {
      await mergeVideoSegments({ prisma, storage }, message.mergedVideoId);
      // eslint-disable-next-line no-console
      console.log(
        `[worker] finished merge ${message.mergedVideoId} in ${Date.now() - startedAt}ms`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[worker] merge ${message.mergedVideoId} failed after ${Date.now() - startedAt}ms:`,
        err,
      );
    }
    return true;
  }

  // Default: video-job
  // eslint-disable-next-line no-console
  console.log(
    `[worker] processing VideoJob ${message.videoJobId} (queue message ${message.id})`,
  );
  try {
    await runVideoJob(
      {
        prisma,
        storage,
        paasClient,
        pollIntervalMs: config.pollIntervalMs,
        pollTimeoutMs: config.pollTimeoutMs,
        imageToVideoDefaults: config.imageToVideo,
      },
      message.videoJobId,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[worker] finished VideoJob ${message.videoJobId} in ${Date.now() - startedAt}ms`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[worker] VideoJob ${message.videoJobId} failed after ${Date.now() - startedAt}ms:`,
      err,
    );
  }
  return true;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log(`[worker] PAAS API URL: ${config.paasApiBaseUrl}`);
  // eslint-disable-next-line no-console
  console.log("[worker] starting i2v-worker poll loop");
  for (;;) {
    let processed: boolean;
    try {
      processed = await tick();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] unexpected error while polling for work:", err);
      processed = false;
    }
    if (!processed) {
      await sleep(config.workerTickMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[worker] fatal error:", err);
    process.exit(1);
  });
}

export { tick };
