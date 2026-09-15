import type {
  ImageListResponse,
  MergedVideo,
  MergedVideoListResponse,
  Series,
  SeriesListResponse,
  Story,
  StoryImportResult,
  StoryListResponse,
  VideoJob,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// The server's rate limiter (429 Too Many Requests) is shared across all
// authenticated endpoints for a given client, so a burst of normal usage
// (e.g. polling while a job is running, plus an explicit action) can
// occasionally trip it even though the request itself is perfectly valid.
// Rather than surfacing a confusing failure to the user, retry a couple of
// times with a short backoff, honoring the `Retry-After` header when the
// server provides one. It's always safe to retry here: a 429 means the
// request was rejected by the rate limiter before it reached the route
// handler, so no mutation was ever attempted.
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(res: Response): number {
  const header = res.headers.get("Retry-After");
  if (!header) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return DEFAULT_RETRY_DELAY_MS;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      ...init,
    });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      attempt++;
      await sleep(parseRetryAfterMs(res));
      continue;
    }
    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.error ?? message;
      } catch {
        // ignore parse errors
      }
      throw new ApiError(res.status, message);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/auth/me"),

  listStories: (page = 1, pageSize = 20, q?: string, seriesId?: string | null) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) params.set("q", q);
    if (seriesId !== undefined) params.set("seriesId", seriesId === null ? "null" : seriesId);
    return request<StoryListResponse>(`/api/stories?${params.toString()}`);
  },
  getStory: (id: string) => request<Story>(`/api/stories/${id}`),
  createStory: (data: { name: string; description: string; seriesId?: string | null; prompts: string[] }) =>
    request<Story>("/api/stories", { method: "POST", body: JSON.stringify(data) }),
  updateStory: (
    id: string,
    data: Partial<{ name: string; description: string; seriesId: string | null; prompts: string[] }>,
  ) => request<Story>(`/api/stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteStory: (id: string) => request<void>(`/api/stories/${id}`, { method: "DELETE" }),
  importStories: (items: unknown[]) =>
    request<StoryImportResult>("/api/stories/import", {
      method: "POST",
      body: JSON.stringify(items),
    }),

  listSeries: () => request<SeriesListResponse>("/api/series"),
  createSeries: (data: { name: string; description: string }) =>
    request<Series>("/api/series", { method: "POST", body: JSON.stringify(data) }),
  updateSeries: (id: string, data: Partial<{ name: string; description: string }>) =>
    request<Series>(`/api/series/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSeries: (id: string) => request<void>(`/api/series/${id}`, { method: "DELETE" }),

  listImages: (page = 1, pageSize = 24, q?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) params.set("q", q);
    return request<ImageListResponse>(`/api/images?${params.toString()}`);
  },
  uploadImages: (files: FileList | File[]) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    return request<{ items: ImageListResponse["items"] }>("/api/images", {
      method: "POST",
      body: form,
    });
  },
  updateImage: (id: string, data: { name?: string; category?: string }) =>
    request<ImageListResponse["items"][number]>(`/api/images/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteImage: (id: string) =>
    request<{ deleted: boolean; wasUsedByVideoJobs: boolean }>(`/api/images/${id}`, {
      method: "DELETE",
    }),
  batchUpdateImages: (data: { ids: string[]; action: "rename" | "category"; value: string }) =>
    request<{ items: ImageListResponse["items"] }>("/api/images/batch", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  listVideoJobs: (storyId: string) =>
    request<{ items: VideoJob[] }>(`/api/stories/${storyId}/videojobs`),
  triggerVideoJob: (storyId: string, imageId: string) =>
    request<VideoJob>(`/api/stories/${storyId}/videojobs`, {
      method: "POST",
      body: JSON.stringify({ imageId }),
    }),
  deleteVideoJob: (id: string) => request<void>(`/api/videojobs/${id}`, { method: "DELETE" }),
  deleteVideoSegment: (jobId: string, seq: number) =>
    request<void>(`/api/videojobs/${jobId}/segments/${seq}`, { method: "DELETE" }),

  regenerateSegment: (jobId: string, seq: number, prompt?: string) =>
    request<VideoJob>(`/api/videojobs/${jobId}/segments/${seq}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),

  dubSegmentAudio: (jobId: string, seq: number, prompt: string, negativePrompt: string) =>
    request<VideoJob>(`/api/videojobs/${jobId}/segments/${seq}/audio`, {
      method: "POST",
      body: JSON.stringify({ prompt, negativePrompt }),
    }),

  mergeVideoJob: (jobId: string) =>
    request<MergedVideo>(`/api/videojobs/${jobId}/merge`, { method: "POST" }),
  listMergedVideos: (page = 1, pageSize = 24, q?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) params.set("q", q);
    return request<MergedVideoListResponse>(`/api/merged-videos?${params.toString()}`);
  },
  deleteMergedVideo: (id: string) =>
    request<void>(`/api/merged-videos/${id}`, { method: "DELETE" }),
};
