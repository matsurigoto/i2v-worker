import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile, execSync } from "child_process";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { BlobStorage } from "@i2v/shared";
import type { PaasApiClient } from "@i2v/shared";

const execFileAsync = promisify(execFile);

vi.mock("../src/download", () => ({
  downloadToBuffer: vi.fn(),
}));

class InMemoryStorage implements BlobStorage {
  private store = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<string> {
    this.store.set(key, data);
    return this.urlFor(key);
  }

  async get(key: string): Promise<Buffer> {
    const value = this.store.get(key);
    if (!value) throw new Error(`Not found: ${key}`);
    return value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  urlFor(key: string): string {
    return `/media/${key}`;
  }
}

function fakePaasClient(overrides?: {
  failAtSeq?: number;
  seqCounterRef?: { count: number };
}): PaasApiClient {
  const seqCounter = overrides?.seqCounterRef ?? { count: 0 };
  return {
    async createImageToVideoTask() {
      seqCounter.count += 1;
      return { id: `task-${seqCounter.count}` };
    },
    async pollTaskUntilDone(taskId: string) {
      const currentSeq = seqCounter.count;
      if (overrides?.failAtSeq && currentSeq === overrides.failAtSeq) {
        throw new Error(`simulated failure at segment ${currentSeq}`);
      }
      return {
        id: taskId,
        status: "completed" as const,
        created: new Date().toISOString(),
        results: { data: { video: { url: `http://paas.local/${taskId}.mp4` } } },
      };
    },
  } as unknown as PaasApiClient;
}

let prisma: import("@i2v/db").PrismaClient;
let tmpDir: string;
let sampleVideoBuffer: Buffer;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-worker-segproc-test-"));
  process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;

  const dbPackageDir = path.resolve(__dirname, "../../db");
  execSync("npx prisma db push --skip-generate", {
    cwd: dbPackageDir,
    env: { ...process.env },
    stdio: "inherit",
  });

  const db = await import("@i2v/db");
  prisma = db.getPrismaClient();

  const videoPath = path.join(tmpDir, "sample.mp4");
  await execFileAsync(ffmpegInstaller.path, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=1:size=32x32:rate=5",
    videoPath,
  ]);
  sampleVideoBuffer = await fs.readFile(videoPath);
}, 30_000);

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function createStoryImageAndJob() {
  const story = await prisma.story.create({
    data: {
      name: "Segment processor test story",
      prompts: {
        create: Array.from({ length: 7 }, (_, i) => ({ seq: i + 1, content: `prompt ${i + 1}` })),
      },
    },
  });
  const storage = new InMemoryStorage();
  const sourceKey = "images/source.png";
  await storage.put(sourceKey, Buffer.from("source-image-bytes"), "image/png");
  const image = await prisma.imageAsset.create({
    data: { name: "source.png", storageKey: sourceKey, contentType: "image/png", size: 10 },
  });
  const job = await prisma.videoJob.create({
    data: { storyId: story.id, sourceImageId: image.id },
  });
  return { story, image, job, storage };
}

describe("runVideoJob", () => {
  it("runs all 7 segments and marks the job completed", async () => {
    const { job, storage } = await createStoryImageAndJob();
    const { downloadToBuffer } = await import("../src/download");
    vi.mocked(downloadToBuffer).mockResolvedValue(sampleVideoBuffer);

    const { runVideoJob } = await import("../src/segmentProcessor");
    await runVideoJob(
      {
        prisma,
        storage,
        paasClient: fakePaasClient(),
        pollIntervalMs: 1,
        pollTimeoutMs: 5000,
      },
      job.id,
    );

    const updated = await prisma.videoJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { segments: { orderBy: { seq: "asc" } } },
    });
    expect(updated.status).toBe("completed");
    expect(updated.segments).toHaveLength(7);
    expect(updated.segments.every((s) => s.status === "completed")).toBe(true);
    expect(updated.segments.every((s) => s.storageKey && s.thumbnailKey)).toBe(true);
  }, 30_000);

  it("marks the job 'failed' when the first segment fails", async () => {
    const { job, storage } = await createStoryImageAndJob();
    const { downloadToBuffer } = await import("../src/download");
    vi.mocked(downloadToBuffer).mockResolvedValue(sampleVideoBuffer);

    const { runVideoJob } = await import("../src/segmentProcessor");
    await runVideoJob(
      {
        prisma,
        storage,
        paasClient: fakePaasClient({ failAtSeq: 1 }),
        pollIntervalMs: 1,
        pollTimeoutMs: 5000,
      },
      job.id,
    );

    const updated = await prisma.videoJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { segments: true },
    });
    expect(updated.status).toBe("failed");
    expect(updated.segments).toHaveLength(1);
    expect(updated.segments[0].status).toBe("failed");
  }, 15_000);

  it("marks the job 'partial' when a later segment fails after earlier ones succeeded", async () => {
    const { job, storage } = await createStoryImageAndJob();
    const { downloadToBuffer } = await import("../src/download");
    vi.mocked(downloadToBuffer).mockResolvedValue(sampleVideoBuffer);

    const { runVideoJob } = await import("../src/segmentProcessor");
    await runVideoJob(
      {
        prisma,
        storage,
        paasClient: fakePaasClient({ failAtSeq: 3 }),
        pollIntervalMs: 1,
        pollTimeoutMs: 5000,
      },
      job.id,
    );

    const updated = await prisma.videoJob.findUniqueOrThrow({
      where: { id: job.id },
      include: { segments: { orderBy: { seq: "asc" } } },
    });
    expect(updated.status).toBe("partial");
    expect(updated.segments).toHaveLength(3);
    expect(updated.segments[0].status).toBe("completed");
    expect(updated.segments[1].status).toBe("completed");
    expect(updated.segments[2].status).toBe("failed");
  }, 30_000);
});
