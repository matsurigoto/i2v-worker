import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { getPrismaClient } from "@i2v/db";
import { LocalFsStorage } from "@i2v/shared";
import { config } from "../config";

export const imagesRouter = Router();

const prisma = getPrismaClient();
const storage = new LocalFsStorage({
  rootDir: config.mediaRootDir,
  publicBasePath: config.mediaPublicBasePath,
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

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

  const created = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const ext = file.originalname.includes(".")
      ? file.originalname.slice(file.originalname.lastIndexOf("."))
      : "";
    const storageKey = `images/${id}${ext}`;
    await storage.put(storageKey, file.buffer, file.mimetype);

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
