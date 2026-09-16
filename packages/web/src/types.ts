export const SEGMENT_COUNT = 7;

export interface Series {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface SeriesListResponse {
  items: Series[];
}

export interface Story {
  id: string;
  name: string;
  description: string;
  seriesId: string | null;
  prompts: string[];
  createdAt: string;
  updatedAt: string;
  videoJobCount?: number;
}

export interface StoryListResponse {
  items: Story[];
  total: number;
  page: number;
  pageSize: number;
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

export interface ImageListResponse {
  items: ImageAsset[];
  total: number;
  page: number;
  pageSize: number;
}

export type VideoJobStatus = "running" | "completed" | "failed" | "partial";
export type VideoSegmentStatus = "pending" | "processing" | "completed" | "failed";

/** Image-to-video models exposed by the PAAS API (apidocs/openapi3.json). */
export type ImageToVideoModel = "wan-2.2" | "ltx-2.3";

export const IMAGE_TO_VIDEO_MODELS: readonly ImageToVideoModel[] = ["wan-2.2", "ltx-2.3"];

export interface VideoSegment {
  id: string;
  videoJobId: string;
  seq: number;
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
  // Image-to-video model used for this batch; null = worker's global default.
  model: ImageToVideoModel | null;
  triggeredAt: string;
  updatedAt: string;
  segments: VideoSegment[];
}

export type MergedVideoStatus = "processing" | "completed" | "failed";

export interface MergedVideo {
  id: string;
  storyId: string;
  videoJobId: string;
  name: string;
  status: MergedVideoStatus;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MergedVideoListResponse {
  items: MergedVideo[];
  total: number;
  page: number;
  pageSize: number;
}
