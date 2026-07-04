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

/**
 * Extracts (approximately) the last frame of a video and returns it as a PNG
 * buffer. Because the PAAS API only supports image-to-video (no
 * video-to-video), this frame becomes the `image` input for the next segment
 * in the 7-part video chain ("影片接龍").
 *
 * We probe the real duration and seek to a small epsilon before the end
 * (rather than relying on a percentage-based seek) to reliably land on the
 * final decodable frame instead of overshooting past end-of-stream. If an
 * epsilon still overshoots the last decodable frame (e.g. for very short or
 * low-frame-rate clips), we retry with progressively larger epsilons
 * (seeking further from the end), finally falling back to the first frame.
 */
export async function extractLastFrame(videoPath: string): Promise<Buffer> {
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
