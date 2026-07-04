import type {
  ImageListResponse,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...init,
  });
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

export const api = {
  login: (username: string, password: string) =>
    request<{ username: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ username: string }>("/api/auth/me"),

  listStories: (page = 1, pageSize = 20, q?: string) =>
    request<StoryListResponse>(
      `/api/stories?page=${page}&pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
  getStory: (id: string) => request<Story>(`/api/stories/${id}`),
  createStory: (data: { name: string; description: string; prompts: string[] }) =>
    request<Story>("/api/stories", { method: "POST", body: JSON.stringify(data) }),
  updateStory: (
    id: string,
    data: Partial<{ name: string; description: string; prompts: string[] }>,
  ) => request<Story>(`/api/stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteStory: (id: string) => request<void>(`/api/stories/${id}`, { method: "DELETE" }),
  importStories: (items: unknown[]) =>
    request<StoryImportResult>("/api/stories/import", {
      method: "POST",
      body: JSON.stringify(items),
    }),

  listImages: (page = 1, pageSize = 24) =>
    request<ImageListResponse>(`/api/images?page=${page}&pageSize=${pageSize}`),
  uploadImages: (files: FileList | File[]) => {
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    return request<{ items: ImageListResponse["items"] }>("/api/images", {
      method: "POST",
      body: form,
    });
  },
  deleteImage: (id: string) =>
    request<{ deleted: boolean; wasUsedByVideoJobs: boolean }>(`/api/images/${id}`, {
      method: "DELETE",
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
};
