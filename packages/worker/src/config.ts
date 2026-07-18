import path from "path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  paasApiBaseUrl: process.env.PAAS_API_BASE_URL ?? "http://localhost:8080",
  pollIntervalMs: num("POLL_INTERVAL_MS", 3000),
  pollTimeoutMs: num("POLL_TIMEOUT_MS", 15 * 60 * 1000),
  workerTickMs: num("WORKER_TICK_MS", 5000),
  mediaRootDir: process.env.MEDIA_ROOT_DIR ?? path.join(process.cwd(), "data", "media"),
  mediaPublicBasePath: process.env.MEDIA_PUBLIC_BASE_PATH ?? "/media",
  storageDriver: process.env.STORAGE_DRIVER ?? "local",
  azureStorageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  azureStorageContainerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
  imageToVideo: {
    model: process.env.IMAGE_TO_VIDEO_MODEL || undefined,
    fps: process.env.IMAGE_TO_VIDEO_FPS ? num("IMAGE_TO_VIDEO_FPS", 0) : undefined,
    numFrames: process.env.IMAGE_TO_VIDEO_NUM_FRAMES
      ? num("IMAGE_TO_VIDEO_NUM_FRAMES", 0)
      : undefined,
    resolution: process.env.IMAGE_TO_VIDEO_RESOLUTION || undefined,
  },
};
