import { describe, expect, it, vi } from "vitest";
import {
  PaasApiClient,
  PaasPollTimeoutError,
  PaasTaskFailedError,
} from "../src/paasClient";

function makeClient() {
  return new PaasApiClient({ baseUrl: "http://paas.local" });
}

describe("PaasApiClient.pollTaskUntilDone", () => {
  it("resolves once the task reaches 'completed'", async () => {
    const client = makeClient();
    const statuses = ["pending", "processing", "completed"];
    const getTaskSpy = vi.spyOn(client, "getTask").mockImplementation(async () => {
      const status = statuses.shift() as "pending" | "processing" | "completed";
      return {
        id: "task-1",
        status,
        created: new Date().toISOString(),
        results: status === "completed" ? { data: { video: { url: "http://x/v.mp4" } } } : null,
      };
    });

    const result = await client.pollTaskUntilDone("task-1", { intervalMs: 1 });
    expect(result.status).toBe("completed");
    expect(getTaskSpy).toHaveBeenCalledTimes(3);
  });

  it("throws PaasTaskFailedError when the task fails", async () => {
    const client = makeClient();
    vi.spyOn(client, "getTask").mockResolvedValue({
      id: "task-2",
      status: "failed",
      created: new Date().toISOString(),
      results: null,
    });

    await expect(client.pollTaskUntilDone("task-2", { intervalMs: 1 })).rejects.toBeInstanceOf(
      PaasTaskFailedError,
    );
  });

  it("throws PaasPollTimeoutError when the deadline elapses", async () => {
    const client = makeClient();
    vi.spyOn(client, "getTask").mockResolvedValue({
      id: "task-3",
      status: "processing",
      created: new Date().toISOString(),
      results: null,
    });

    await expect(
      client.pollTaskUntilDone("task-3", { intervalMs: 5, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(PaasPollTimeoutError);
  });
});
