import { getPrismaClient } from "@i2v/db";
import { createStorageFromEnv, PaasApiClient } from "@i2v/shared";
import { config } from "./config";
import { claimNextMessage } from "./queue";
import { runVideoJob } from "./segmentProcessor";

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
  apiKey: config.paasApiKey,
});

async function tick(): Promise<boolean> {
  const message = await claimNextMessage(prisma);
  if (!message) return false;

  const startedAt = Date.now();
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
