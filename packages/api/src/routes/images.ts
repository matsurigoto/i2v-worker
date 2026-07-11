import { Router } from "express";
import crypto from "crypto";
import { promises as fsp } from "fs";
import multer from "multer";
import { getPrismaClient } from "@i2v/db";
import { config } from "../config";
import { storage } from "../storage";

export const imagesRouter = Router();

const prisma = getPrismaClient();

// Uploads are streamed to a temp directory on disk (rather than buffered
// entirely in memory via multer.memoryStorage) so that multi-file uploads
// don't hold every file's full contents in process memory simultaneously,
// which risked OOM/502s under the App Service plan's limited RAM.
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fsp.mkdir(config.uploadTmpDir, { recursive: true });
        cb(null, config.uploadTmpDir);
      } catch (err) {
        cb(err as Error, config.uploadTmpDir);
      }
    },
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

imagesRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(
    100,
    Math.max(1, Number(req.query.pageSize ?? config.imagesPageSizeDefault)),
  );

  const [total, images] = await Promise.all([
    prisma.imageAsset.count(),
    prisma.imageAsset.findMany({
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    items: images.map((img) => ({
      id: img.id,
      name: img.name,
      url: storage.urlFor(img.storageKey),
      contentType: img.contentType,
      size: img.size,
      uploadedAt: img.uploadedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  });
});

imagesRouter.get("/:id", async (req, res) => {
  const image = await prisma.imageAsset.findUnique({ where: { id: req.params.id } });
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }
  res.json({
    id: image.id,
    name: image.name,
    url: storage.urlFor(image.storageKey),
    contentType: image.contentType,
    size: image.size,
    uploadedAt: image.uploadedAt.toISOString(),
  });
});

imagesRouter.post("/", upload.array("files", 50), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: "No files uploaded (expected multipart field 'files')" });
    return;
  }

  const uploadedStorageKeys: string[] = [];
  try {
    const created = [];
    // Process files sequentially, reading each one's bytes from its temp
    // file just before uploading it, so at most one file's contents are
    // held in memory at a time (unlike the previous memoryStorage
    // approach, which buffered every file in the request simultaneously).
    for (const file of files) {
      const id = crypto.randomUUID();
      const ext = file.originalname.includes(".")
        ? file.originalname.slice(file.originalname.lastIndexOf("."))
        : "";
      const storageKey = `images/${id}${ext}`;
      const buffer = await fsp.readFile(file.path);
      await storage.put(storageKey, buffer, file.mimetype);
      uploadedStorageKeys.push(storageKey);

      const image = await prisma.imageAsset.create({
        data: {
          id,
          name: file.originalname,
          storageKey,
          contentType: file.mimetype,
          size: file.size,
        },
      });
      created.push({
        id: image.id,
        name: image.name,
        url: storage.urlFor(image.storageKey),
        contentType: image.contentType,
        size: image.size,
        uploadedAt: image.uploadedAt.toISOString(),
      });
    }

    res.status(201).json({ items: created });
  } catch (err) {
    // If a later file in a multi-file upload fails, don't leave orphaned
    // blobs behind for the files that already succeeded before the error.
    await Promise.all(
      uploadedStorageKeys.map((key) =>
        storage.delete(key).catch((cleanupErr) => {
          // eslint-disable-next-line no-console
          console.error("Failed to roll back orphaned blob:", key, cleanupErr);
        }),
      ),
    );
    // eslint-disable-next-line no-console
    console.error("Failed to process image upload:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to process image upload" });
    }
  } finally {
    await Promise.all(
      files.map((file) =>
        fsp.rm(file.path, { force: true }).catch((cleanupErr) => {
          // eslint-disable-next-line no-console
          console.error("Failed to remove temp upload file:", file.path, cleanupErr);
        }),
      ),
    );
  }
});

imagesRouter.delete("/:id", async (req, res) => {
  const image = await prisma.imageAsset.findUnique({ where: { id: req.params.id } });
  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  const usageCount = await prisma.videoJob.count({ where: { sourceImageId: image.id } });

  await storage.delete(image.storageKey);
  await prisma.imageAsset.delete({ where: { id: image.id } });

  res.json({
    deleted: true,
    wasUsedByVideoJobs: usageCount > 0,
  });
});
