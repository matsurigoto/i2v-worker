/**
 * Domain types shared between the API service and the background worker.
 *
 * A "Story" is composed of exactly SEGMENT_COUNT (7) prompts. Producing a
 * video for a story triggers a "VideoJob" which is a chain of
 * SEGMENT_COUNT "VideoSegment"s ("影片接龍" - video relay/chaining):
 *
 *   segment 1: image-to-video(sourceImage, prompt[0])
 *   segment N (N>1): image-to-video(lastFrameOf(segment N-1), prompt[N-1])
 *
 * The PAAS API (see apidocs/openapi3.json) does not expose a
 * "video-to-video" task type, only "image-to-video". Therefore each
 * subsequent segment is produced by extracting the last frame of the
 * previous segment's video (via ffmpeg) and feeding that frame back in as
 * the `image` input together with the next prompt in the story.
 */

export const SEGMENT_COUNT = 7;

/** Task status values as defined by apidocs/openapi3.json `#/.../status`. */
export type PaasTaskStatus =
  | "pending"
  | "preparing"
  | "processing"
  | "completed"
  | "failed"
  | "canceled"
  | "timeout"
  | "unknown";

export const PAAS_TERMINAL_STATUSES: readonly PaasTaskStatus[] = [
  "completed",
  "failed",
  "canceled",
  "timeout",
];

export function isTerminalPaasStatus(status: PaasTaskStatus): boolean {
  return (PAAS_TERMINAL_STATUSES as string[]).includes(status);
}

export interface Series {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Story {
  id: string;
  name: string;
  description: string;
  seriesId: string | null;
  prompts: string[]; // length === SEGMENT_COUNT, ordered seq 1..7
  createdAt: string;
  updatedAt: string;
  videoJobCount?: number;
}

export interface StoryImportItem {
  name: string;
  description?: string;
  seriesId?: string | null;
  prompts: string[];
}

export interface StoryImportError {
  index: number;
  name?: string;
  errors: string[];
}

export interface StoryImportResult {
  createdCount: number;
  created: Story[];
  errors: StoryImportError[];
}

export interface ImageAsset {
  id: string;
  name: string;
  category: string;
  url: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export type VideoJobStatus = "running" | "completed" | "failed" | "partial";

export type VideoSegmentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface VideoSegment {
  id: string;
  videoJobId: string;
  seq: number; // 1..SEGMENT_COUNT
  status: VideoSegmentStatus;
  apiTaskId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoJob {
  id: string;
  storyId: string;
  sourceImageId: string;
  status: VideoJobStatus;
  triggeredAt: string;
  updatedAt: string;
  segments: VideoSegment[];
}

/** Human readable explanation of the video-chaining mechanism, reused by API docs and the web UI. */
export const VIDEO_CHAIN_EXPLANATION =
  "PAAS API 僅提供 image-to-video，沒有 video-to-video。因此第 2~7 段影片，是由前一段影片" +
  "擷取最後一幀畫面(ffmpeg)做為新的 image 輸入，搭配該段的提示詞再次呼叫 image-to-video 產生，" +
  "形成七段影片接龍。";
