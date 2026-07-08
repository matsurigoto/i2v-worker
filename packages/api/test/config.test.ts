import { afterEach, describe, expect, it, vi } from "vitest";

describe("config.corsOrigin", () => {
  const originalEnv = process.env.CORS_ORIGIN;

  afterEach(() => {
    process.env.CORS_ORIGIN = originalEnv;
    vi.resetModules();
  });

  it("strips trailing slashes so origin comparisons match the browser's Origin header", async () => {
    process.env.CORS_ORIGIN = "https://app.example.com/,http://localhost:5173/";
    vi.resetModules();
    const { config } = await import("../src/config");
    expect(config.corsOrigin).toEqual(["https://app.example.com", "http://localhost:5173"]);
  });
});
