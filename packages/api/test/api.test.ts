import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import request from "supertest";

let tmpDir: string;
let app: import("express").Express;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "i2v-api-test-"));
  process.env.DATABASE_URL = `file:${path.join(tmpDir, "test.db")}`;
  process.env.MEDIA_ROOT_DIR = path.join(tmpDir, "media");
  process.env.JWT_SECRET = "test-secret";
  process.env.AUTH_USERNAME = "admin";
  // bcrypt hash of "admin"
  process.env.AUTH_PASSWORD_HASH =
    "$2a$10$Ar7JzAIi8fWs6g3JR/PHduOj4GqI1iSjQqR6ho1bCB0LM6ylv1FJ6";
  process.env.CORS_ORIGIN = "https://app.example.com,http://localhost:5173";

  const dbPackageDir = path.resolve(__dirname, "../../db");
  execSync("npx prisma db push --skip-generate", {
    cwd: dbPackageDir,
    env: { ...process.env },
    stdio: "inherit",
  });

  const { createApp } = await import("../src/index");
  app = createApp();
  agent = request.agent(app);
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function login() {
  const res = await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  expect(res.status).toBe(200);
}

describe("auth", () => {
  it("rejects bad credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated access to protected routes", async () => {
    const res = await request(app).get("/api/stories");
    expect(res.status).toBe(401);
  });

  it("logs in with valid credentials and can access /me", async () => {
    await login();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("admin");
  });
});

describe("stories CRUD", () => {
  beforeEach(async () => {
    await login();
  });

  it("rejects a story without exactly 7 prompts", async () => {
    const res = await agent.post("/api/stories").send({
      name: "Bad story",
      description: "x",
      prompts: ["only one"],
    });
    expect(res.status).toBe(400);
  });

  it("creates, lists, updates and deletes a story", async () => {
    const prompts = Array.from({ length: 7 }, (_, i) => `prompt ${i + 1}`);
    const createRes = await agent.post("/api/stories").send({
      name: "My Story",
      description: "desc",
      prompts,
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.prompts).toEqual(prompts);
    const id = createRes.body.id;

    const listRes = await agent.get("/api/stories");
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.some((s: { id: string }) => s.id === id)).toBe(true);

    const updateRes = await agent.put(`/api/stories/${id}`).send({ name: "Renamed" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe("Renamed");

    const deleteRes = await agent.delete(`/api/stories/${id}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await agent.get(`/api/stories/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("imports a batch of stories from JSON, reporting per-item errors", async () => {
    const validPrompts = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
    const res = await agent
      .post("/api/stories/import")
      .send([
        { name: "Good story", description: "ok", prompts: validPrompts },
        { name: "Bad story", prompts: ["too short"] },
      ]);

    expect(res.status).toBe(207);
    expect(res.body.createdCount).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(1);
  });
});

describe("images", () => {
  beforeEach(async () => {
    await login();
  });

  it("uploads, lists (paginated) and deletes images", async () => {
    const uploadRes = await agent
      .post("/api/images")
      .attach("files", Buffer.from("fake-image-bytes"), "photo.png");
    expect(uploadRes.status).toBe(201);
    const image = uploadRes.body.items[0];
    expect(image.name).toBe("photo.png");

    const listRes = await agent.get("/api/images?page=1&pageSize=10");
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.some((i: { id: string }) => i.id === image.id)).toBe(true);

    const deleteRes = await agent.delete(`/api/images/${image.id}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted).toBe(true);

    const getRes = await agent.get(`/api/images/${image.id}`);
    expect(getRes.status).toBe(404);
  });
});

describe("video jobs", () => {
  beforeEach(async () => {
    await login();
  });

  it("requires a story with 7 prompts and an existing image to trigger generation", async () => {
    const prompts = Array.from({ length: 7 }, (_, i) => `p${i + 1}`);
    const storyRes = await agent
      .post("/api/stories")
      .send({ name: "Video Story", description: "", prompts });
    const storyId = storyRes.body.id;

    const missingImageRes = await agent
      .post(`/api/stories/${storyId}/videojobs`)
      .send({ imageId: "does-not-exist" });
    expect(missingImageRes.status).toBe(404);

    const uploadRes = await agent
      .post("/api/images")
      .attach("files", Buffer.from("fake-image-bytes"), "source.png");
    const imageId = uploadRes.body.items[0].id;

    const triggerRes = await agent
      .post(`/api/stories/${storyId}/videojobs`)
      .send({ imageId });
    expect(triggerRes.status).toBe(201);
    expect(triggerRes.body.status).toBe("running");
    expect(triggerRes.body.segments).toHaveLength(7);
    expect(triggerRes.body.segments[0].status).toBe("pending");

    const listRes = await agent.get(`/api/stories/${storyId}/videojobs`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(1);

    const deleteRes = await agent.delete(`/api/videojobs/${triggerRes.body.id}`);
    expect(deleteRes.status).toBe(204);
  });
});

describe("CORS", () => {
  it("allows preflight from a configured origin", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://app.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });

  it("allows preflight from a second configured origin", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "POST");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("does not echo CORS headers for an unknown origin", async () => {
    const res = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
