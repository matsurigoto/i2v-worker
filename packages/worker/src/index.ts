import { getPrismaClient } from "@i2v/db";
import { LocalFsStorage, PaasApiClient } from "@i2v/shared";
import { config } from "./config";
import { claimNextMessage } from "./queue";
import { runVideoJob } from "./segmentProcessor";

const prisma = getPrismaClient();
const storage = new LocalFsStorage({
  rootDir: config.mediaRootDir,
  publicBasePath: config.mediaPublicBasePath,
});
const paasClient = new PaasApiClient({
  baseUrl: config.paasApiBaseUrl,
  apiKey: config.paasApiKey,
});

async function tick(): Promise<boolean> {
  const message = await claimNextMessage(prisma);
  if (!message) return false;

  // eslint-disable-next-line no-console
  console.log(`[worker] processing VideoJob ${message.videoJobId}`);
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
    console.log(`[worker] finished VideoJob ${message.videoJobId}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[worker] VideoJob ${message.videoJobId} failed:`, err);
  }
  return true;
}

async function main() {
  // eslint-disable-next-line no-console
  console.log("[worker] starting i2v-worker poll loop");
  for (;;) {
    const processed = await tick();
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
