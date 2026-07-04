import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";

let prisma: import("@i2v/db").PrismaClient;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-worker-queue-test-"));
  process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;

  const dbPackageDir = path.resolve(__dirname, "../../db");
  execSync("npx prisma db push --skip-generate", {
    cwd: dbPackageDir,
    env: { ...process.env },
    stdio: "inherit",
  });

  const db = await import("@i2v/db");
  prisma = db.getPrismaClient();
});

afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("claimNextMessage", () => {
  it("returns null when the queue is empty", async () => {
    const { claimNextMessage } = await import("../src/queue");
    const message = await claimNextMessage(prisma);
    expect(message).toBeNull();
  });

  it("claims messages in FIFO order and marks them processed", async () => {
    const { claimNextMessage } = await import("../src/queue");

    const story = await prisma.story.create({
      data: {
        name: "Queue test story",
        prompts: { create: Array.from({ length: 7 }, (_, i) => ({ seq: i + 1, content: `p${i}` })) },
      },
    });
    const image = await prisma.imageAsset.create({
      data: { name: "img.png", storageKey: "images/img.png", contentType: "image/png", size: 1 },
    });
    const jobA = await prisma.videoJob.create({
      data: { storyId: story.id, sourceImageId: image.id },
    });
    const jobB = await prisma.videoJob.create({
      data: { storyId: story.id, sourceImageId: image.id },
    });
    await prisma.queueMessage.create({ data: { videoJobId: jobA.id } });
    await prisma.queueMessage.create({ data: { videoJobId: jobB.id } });

    const first = await claimNextMessage(prisma);
    expect(first?.videoJobId).toBe(jobA.id);

    const second = await claimNextMessage(prisma);
    expect(second?.videoJobId).toBe(jobB.id);

    const third = await claimNextMessage(prisma);
    expect(third).toBeNull();

    const messages = await prisma.queueMessage.findMany({
      where: { videoJobId: { in: [jobA.id, jobB.id] } },
    });
    expect(messages.every((m) => m.processed)).toBe(true);
  });
});
