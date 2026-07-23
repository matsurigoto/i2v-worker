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
  triggeredAt: string;
  updatedAt: string;
  segments: VideoSegment[];
}
