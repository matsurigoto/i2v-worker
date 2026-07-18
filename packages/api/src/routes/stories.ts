import { Router } from "express";
import { getPrismaClient } from "@i2v/db";
import { SEGMENT_COUNT, Story, StoryImportItem, StoryImportResult } from "@i2v/shared";

export const storiesRouter = Router();

const prisma = getPrismaClient();

function toStoryDto(story: {
  id: string;
  name: string;
  description: string;
  seriesId: string | null;
  createdAt: Date;
  updatedAt: Date;
  prompts: { seq: number; content: string }[];
}): Story {
  const prompts = new Array<string>(SEGMENT_COUNT).fill("");
  for (const p of story.prompts) {
    if (p.seq >= 1 && p.seq <= SEGMENT_COUNT) {
      prompts[p.seq - 1] = p.content;
    }
  }
  return {
    id: story.id,
    name: story.name,
    description: story.description,
    seriesId: story.seriesId,
    prompts,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
  };
}

function validatePrompts(prompts: unknown): string[] | null {
  if (!Array.isArray(prompts) || prompts.length !== SEGMENT_COUNT) {
    return null;
  }
  if (!prompts.every((p) => typeof p === "string" && p.trim().length > 0)) {
    return null;
  }
  return prompts as string[];
}

storiesRouter.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  const search = typeof req.query.q === "string" ? req.query.q : undefined;
  // seriesId=null means stories with no series assigned (預設)
  const seriesIdParam = req.query.seriesId;
  const filterBySeriesId =
    seriesIdParam === "null"
      ? { seriesId: null }
      : typeof seriesIdParam === "string"
        ? { seriesId: seriesIdParam }
        : {};

  const where = {
    ...filterBySeriesId,
    ...(search ? { name: { contains: search } } : {}),
  };

  const [total, stories] = await Promise.all([
    prisma.story.count({ where }),
    prisma.story.findMany({
      where,
      include: { prompts: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({
    items: stories.map(toStoryDto),
    total,
    page,
    pageSize,
  });
});

storiesRouter.get("/:id", async (req, res) => {
  const story = await prisma.story.findUnique({
    where: { id: req.params.id },
    include: { prompts: true },
  });
  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  res.json(toStoryDto(story));
});

storiesRouter.post("/", async (req, res) => {
  const { name, description, prompts, seriesId } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const validPrompts = validatePrompts(prompts);
  if (!validPrompts) {
    res.status(400).json({
      error: `prompts must be an array of exactly ${SEGMENT_COUNT} non-empty strings`,
    });
    return;
  }

  if (seriesId !== undefined && seriesId !== null) {
    const series = await prisma.series.findUnique({ where: { id: seriesId } });
    if (!series) {
      res.status(400).json({ error: "seriesId references a series that does not exist" });
      return;
    }
  }

  const story = await prisma.story.create({
    data: {
      name,
      description: description ?? "",
      seriesId: seriesId ?? null,
      prompts: {
        create: validPrompts.map((content, index) => ({ seq: index + 1, content })),
      },
    },
    include: { prompts: true },
  });
  res.status(201).json(toStoryDto(story));
});

storiesRouter.put("/:id", async (req, res) => {
  const { name, description, prompts, seriesId } = req.body ?? {};
  const existing = await prisma.story.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }

  let validPrompts: string[] | null | undefined;
  if (prompts !== undefined) {
    validPrompts = validatePrompts(prompts);
    if (!validPrompts) {
      res.status(400).json({
        error: `prompts must be an array of exactly ${SEGMENT_COUNT} non-empty strings`,
      });
      return;
    }
  }

  // seriesId: null explicitly unassigns, a string assigns, undefined = no change
  if (seriesId !== undefined && seriesId !== null) {
    const series = await prisma.series.findUnique({ where: { id: seriesId } });
    if (!series) {
      res.status(400).json({ error: "seriesId references a series that does not exist" });
      return;
    }
  }

  const story = await prisma.$transaction(async (tx) => {
    if (validPrompts) {
      await tx.prompt.deleteMany({ where: { storyId: req.params.id } });
      await tx.prompt.createMany({
        data: validPrompts.map((content, index) => ({
          storyId: req.params.id,
          seq: index + 1,
          content,
        })),
      });
    }
    return tx.story.update({
      where: { id: req.params.id },
      data: {
        name: name ?? undefined,
        description: description ?? undefined,
        ...(seriesId !== undefined ? { seriesId } : {}),
      },
      include: { prompts: true },
    });
  });

  res.json(toStoryDto(story));
});

storiesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.story.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  // Deleting a story does not delete previously generated videos; VideoJob
  // rows reference storyId without cascading in the domain sense (DB FK
  // cascade removes rows to keep referential integrity, but this endpoint
  // is intended for stories that no longer have production history, or the
  // caller has already confirmed the impact via the confirmation dialog).
  await prisma.story.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

storiesRouter.post("/import", async (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) {
    res.status(400).json({ error: "Request body must be a JSON array of stories" });
    return;
  }

  const result: StoryImportResult = { createdCount: 0, created: [], errors: [] };

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] as Partial<StoryImportItem>;
    const errors: string[] = [];

    if (typeof item?.name !== "string" || item.name.trim().length === 0) {
      errors.push("name is required");
    }
    const validPrompts = validatePrompts(item?.prompts);
    if (!validPrompts) {
      errors.push(`prompts must be an array of exactly ${SEGMENT_COUNT} non-empty strings`);
    }

    if (item?.seriesId != null) {
      const series = await prisma.series.findUnique({ where: { id: item.seriesId } });
      if (!series) {
        errors.push(`seriesId '${item.seriesId}' references a series that does not exist`);
      }
    }

    if (errors.length > 0) {
      result.errors.push({ index, name: item?.name, errors });
      continue;
    }

    const story = await prisma.story.create({
      data: {
        name: item.name as string,
        description: item.description ?? "",
        seriesId: item.seriesId ?? null,
        prompts: {
          create: (validPrompts as string[]).map((content, i) => ({
            seq: i + 1,
            content,
          })),
        },
      },
      include: { prompts: true },
    });
    result.created.push(toStoryDto(story));
    result.createdCount += 1;
  }

  res.status(result.errors.length > 0 ? 207 : 201).json(result);
});
