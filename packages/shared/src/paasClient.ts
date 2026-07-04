import axios, { AxiosInstance } from "axios";
import { PaasTaskStatus, isTerminalPaasStatus } from "./types";

export interface PaasClientOptions {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface ImageToVideoParams {
  image: string; // base64 or https:// url
  prompt: string;
  fps?: number;
  numFrames?: number;
  resolution?: string;
  seed?: number;
  model?: string;
}

export interface CreateTaskResponse {
  id: string;
}

export interface PaasTask {
  id: string;
  status: PaasTaskStatus;
  created: string;
  type?: string;
  results: {
    data?: {
      video?: { url: string };
      [key: string]: unknown;
    };
  } | null;
}

export interface PollOptions {
  /** Interval between polls, in ms. Default: 3000. */
  intervalMs?: number;
  /** Overall timeout for polling, in ms. Default: 15 minutes. */
  timeoutMs?: number;
  /** Optional callback invoked after every poll with the latest task snapshot. */
  onPoll?: (task: PaasTask) => void;
}

export class PaasTaskFailedError extends Error {
  constructor(public readonly task: PaasTask) {
    super(`PAAS task ${task.id} ended with status "${task.status}"`);
    this.name = "PaasTaskFailedError";
  }
}

export class PaasPollTimeoutError extends Error {
  constructor(public readonly taskId: string) {
    super(`Timed out waiting for PAAS task ${taskId} to complete`);
    this.name = "PaasPollTimeoutError";
  }
}

/**
 * Thin client for the PAAS API described in apidocs/openapi3.json.
 * Only the subset of endpoints needed by this project is implemented:
 *  - POST /api/v3/tasks            (create a task, e.g. image-to-video)
 *  - GET  /api/v3/tasks/{task}     (retrieve a task, used for long polling)
 */
export class PaasApiClient {
  private readonly http: AxiosInstance;

  constructor(private readonly options: PaasClientOptions) {
    this.http = axios.create({
      baseURL: options.baseUrl,
      timeout: options.timeoutMs ?? 30_000,
      headers: options.apiKey
        ? { Authorization: "Bearer " + options.apiKey }
        : undefined,
    });
  }

  async createImageToVideoTask(
    params: ImageToVideoParams,
  ): Promise<CreateTaskResponse> {
    const { data } = await this.http.post("/api/v3/tasks", {
      payload: {
        image: params.image,
        prompt: params.prompt,
        fps: params.fps,
        numFrames: params.numFrames,
        resolution: params.resolution,
        seed: params.seed,
        model: params.model,
      },
    });
    return { id: data.id };
  }

  async getTask(taskId: string): Promise<PaasTask> {
    const { data } = await this.http.get(`/api/v3/tasks/${taskId}`);
    return data as PaasTask;
  }

  /**
   * Long-polls GET /api/v3/tasks/{task} until it reaches a terminal status
   * (completed/failed/canceled/timeout), resolving with the final task, or
   * throwing PaasTaskFailedError / PaasPollTimeoutError.
   */
  async pollTaskUntilDone(
    taskId: string,
    pollOptions: PollOptions = {},
  ): Promise<PaasTask> {
    const intervalMs = pollOptions.intervalMs ?? 3000;
    const timeoutMs = pollOptions.timeoutMs ?? 15 * 60 * 1000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const task = await this.getTask(taskId);
      pollOptions.onPoll?.(task);

      if (isTerminalPaasStatus(task.status)) {
        if (task.status === "completed") {
          return task;
        }
        if (task.status === "timeout" || task.status === "canceled") {
          throw new PaasTaskFailedError(task);
        }
        throw new PaasTaskFailedError(task);
      }

      if (Date.now() >= deadline) {
        throw new PaasPollTimeoutError(taskId);
      }

      await sleep(intervalMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
