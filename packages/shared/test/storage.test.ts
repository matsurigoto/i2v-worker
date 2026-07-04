import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { LocalFsStorage } from "../src/storage";

describe("LocalFsStorage", () => {
  let rootDir: string;
  let storage: LocalFsStorage;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-storage-test-"));
    storage = new LocalFsStorage({ rootDir, publicBasePath: "/media" });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("writes and reads back a buffer", async () => {
    const url = await storage.put("images/a.png", Buffer.from("hello"), "image/png");
    expect(url).toBe("/media/images/a.png");
    const data = await storage.get("images/a.png");
    expect(data.toString()).toBe("hello");
  });

  it("deletes an object", async () => {
    await storage.put("images/b.png", Buffer.from("bye"), "image/png");
    await storage.delete("images/b.png");
    await expect(storage.get("images/b.png")).rejects.toThrow();
  });

  it("urlFor normalizes leading slashes", () => {
    expect(storage.urlFor("/images/c.png")).toBe("/media/images/c.png");
  });
});
