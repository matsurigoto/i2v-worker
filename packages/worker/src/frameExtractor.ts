import { promises as fs } from "fs";
import os from "os";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

function probeDurationSeconds(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      const duration = data.format?.duration;
      resolve(typeof duration === "number" ? duration : 0);
    });
  });
}

async function extractFrameAt(videoPath: string, timestampSeconds: number): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-frame-"));
  const outputPath = path.join(tmpDir, "frame.png");

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .screenshots({
          timestamps: [timestampSeconds],
          filename: path.basename(outputPath),
          folder: tmpDir,
        });
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Extracts the first frame of a video and returns it as a PNG buffer. Used
 * as a display thumbnail for a completed video segment.
 */
export async function extractFirstFrame(videoPath: string): Promise<Buffer> {
  return extractFrameAt(videoPath, 0);
}

const LAST_FRAME_CANDIDATES = 8;

/**
 * Decodes the tail of the video and returns the last `count` frames as
 * lossless PNG buffers (in order).
 */
async function extractTailFrames(videoPath: string, count: number): Promise<Buffer[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-tail-"));
  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .inputOptions(["-sseof", "-2"])
        .outputOptions(["-vsync", "0"])
        .output(path.join(tmpDir, "f_%04d.png"))
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });
    const files = (await fs.readdir(tmpDir)).filter((f) => f.endsWith(".png")).sort();
    return await Promise.all(
      files.slice(-count).map((f) => fs.readFile(path.join(tmpDir, f))),
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Extracts the last frame of a video as a lossless PNG buffer. Because the
 * PAAS API only supports image-to-video (no video-to-video), this frame
 * becomes the `image` input for the next segment in the 7-part video chain
 * ("影片接龍").
 *
 * The very last frames of generated clips are often motion-blurred, so we
 * decode the last few frames and pick the sharpest one. PNG file size is
 * used as a sharpness proxy: blurry frames compress better (smaller), while
 * detailed frames are larger. If that fails (e.g. very short clips), we fall
 * back to seeking near the end with progressively larger epsilons.
 */
export async function extractLastFrame(videoPath: string): Promise<Buffer> {
  try {
    const frames = await extractTailFrames(videoPath, LAST_FRAME_CANDIDATES);
    if (frames.length > 0) {
      return frames.reduce((best, cur) => (cur.length > best.length ? cur : best));
    }
  } catch {
    // fall through to timestamp-based extraction
  }

  const duration = await probeDurationSeconds(videoPath);
  const epsilons = [0.15, 0.3, 0.5, 0.75, 1, 2, duration];

  let lastError: unknown;
  for (const epsilon of epsilons) {
    const timestamp = Math.max(0, duration - epsilon);
    try {
      return await extractFrameAt(videoPath, timestamp);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to extract last frame from ${videoPath}`);
}
