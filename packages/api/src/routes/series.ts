import { Router } from "express";
import { getPrismaClient } from "@i2v/db";
import { Series } from "@i2v/shared";

export const seriesRouter = Router();

const prisma = getPrismaClient();

function toSeriesDto(series: {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}): Series {
  return {
    id: series.id,
    name: series.name,
    description: series.description,
    createdAt: series.createdAt.toISOString(),
    updatedAt: series.updatedAt.toISOString(),
  };
}

seriesRouter.get("/", async (_req, res) => {
  const items = await prisma.series.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ items: items.map(toSeriesDto) });
});

seriesRouter.get("/:id", async (req, res) => {
  const series = await prisma.series.findUnique({ where: { id: req.params.id } });
  if (!series) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  res.json(toSeriesDto(series));
});

seriesRouter.post("/", async (req, res) => {
  const { name, description } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const series = await prisma.series.create({
    data: { name, description: description ?? "" },
  });
  res.status(201).json(toSeriesDto(series));
});

seriesRouter.put("/:id", async (req, res) => {
  const existing = await prisma.series.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  const { name, description } = req.body ?? {};
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  const series = await prisma.series.update({
    where: { id: req.params.id },
    data: {
      name: name ?? undefined,
      description: description ?? undefined,
    },
  });
  res.json(toSeriesDto(series));
});

seriesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.series.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Series not found" });
    return;
  }
  // Stories in this series will have their seriesId set to null (onDelete: SetNull)
  await prisma.series.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
