import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { PrismaClient } from "@i2v/db";
import type { BlobStorage } from "@i2v/shared";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { extractFirstFrame } from "./frameExtractor";

const execFileAsync = promisify(execFile);

export interface MergeContext {
  prisma: PrismaClient;
  storage: BlobStorage;
}

/**
 * Merges the 7 completed video segments of a VideoJob into a single video
 * file using ffmpeg's concat demuxer with `-c copy` (no re-encoding).
 */
export async function mergeVideoSegments(
  ctx: MergeContext,
  mergedVideoId: string,
): Promise<void> {
  const merged = await ctx.prisma.mergedVideo.findUnique({
    where: { id: mergedVideoId },
    include: {
      videoJob: {
        include: {
          segments: { where: { status: "completed" }, orderBy: { seq: "asc" } },
        },
      },
    },
  });

  if (!merged) {
    throw new Error(`MergedVideo ${mergedVideoId} not found`);
  }

  const segments = merged.videoJob.segments.filter((s) => s.storageKey);
  if (segments.length === 0) {
    await ctx.prisma.mergedVideo.update({
      where: { id: mergedVideoId },
      data: { status: "failed", errorMessage: "No completed segments with video files" },
    });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-merge-"));

  try {
    // 1. Download all segment videos to temp dir
    const segmentPaths: string[] = [];
    for (const seg of segments) {
      const segPath = path.join(tmpDir, `seg-${seg.seq}.mp4`);
      const data = await ctx.storage.get(seg.storageKey!);
      await fs.writeFile(segPath, data);
      segmentPaths.push(segPath);
    }

    // 2. Build ffmpeg concat file list
    const fileListPath = path.join(tmpDir, "filelist.txt");
    const fileListContent = segmentPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await fs.writeFile(fileListPath, fileListContent);

    // 3. Run ffmpeg concat demuxer
    const outputPath = path.join(tmpDir, "merged.mp4");
    await execFileAsync(ffmpegInstaller.path, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", fileListPath,
      "-c", "copy",
      outputPath,
    ]);

    // 4. Read merged video and upload to storage
    const mergedData = await fs.readFile(outputPath);
    const storageKey = `merged/${mergedVideoId}/merged.mp4`;
    await ctx.storage.put(storageKey, mergedData, "video/mp4");

    // 5. Extract first frame as thumbnail
    const thumbBuffer = await extractFirstFrame(outputPath);
    const thumbnailKey = `merged/${mergedVideoId}/thumb.png`;
    await ctx.storage.put(thumbnailKey, thumbBuffer, "image/png");

    // 6. Update record
    await ctx.prisma.mergedVideo.update({
      where: { id: mergedVideoId },
      data: {
        status: "completed",
        storageKey,
        thumbnailKey,
        contentType: "video/mp4",
        size: mergedData.length,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await ctx.prisma.mergedVideo.update({
      where: { id: mergedVideoId },
      data: { status: "failed", errorMessage },
    });
    throw err;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
