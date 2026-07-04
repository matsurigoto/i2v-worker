import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { extractFirstFrame, extractLastFrame } from "../src/frameExtractor";

const execFileAsync = promisify(execFile);

describe("frameExtractor", () => {
  let tmpDir: string;
  let videoPath: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-frame-test-"));
    videoPath = path.join(tmpDir, "sample.mp4");
    // Generate a tiny 2-second test pattern video with ffmpeg's built-in
    // lavfi source, so tests don't depend on any external test fixtures.
    await execFileAsync(ffmpegInstaller.path, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2:size=64x64:rate=10",
      videoPath,
    ]);
  }, 30_000);

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("extracts the first frame as a non-empty PNG buffer", async () => {
    const buffer = await extractFirstFrame(videoPath);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }, 15_000);

  it("extracts the last frame as a non-empty PNG buffer", async () => {
    const buffer = await extractLastFrame(videoPath);
    expect(buffer.length).toBeGreaterThan(0);
  }, 15_000);
});
