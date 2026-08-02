import { Router } from "express";
import path from "path";
import { storage } from "../storage";

export const mediaRouter = Router();

/**
 * Returns the API-relative URL for a given storage key.
 * All media is served through the authenticated /api/media/* proxy
 * so that callers must hold a valid session to access any asset.
 */
export function mediaUrl(storageKey: string): string {
  const safeKey = storageKey.replace(/^\/+/, "");
  return `/api/media/${safeKey}`;
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/**
 * GET /api/media/*
 *
 * Authenticated media proxy. Reads the requested blob from storage and
 * streams it back with the appropriate Content-Type.  The route is mounted
 * with `requireAuth`, so callers without a valid session receive a 401
 * before this handler is reached.
 *
 * Path-traversal attacks (any segment containing "..") are rejected with 400.
 */
mediaRouter.get("/*", async (req, res) => {
  // req.params[0] is the splat captured by "/*"
  const rawKey: string = (req.params as Record<string, string>)[0] ?? "";

  // Reject paths that contain ".." to prevent traversal outside the bucket.
  const normalised = path.posix.normalize(rawKey);
  if (normalised.includes("..") || rawKey.includes("..")) {
    res.status(400).json({ error: "Invalid media path" });
    return;
  }

  const storageKey = normalised.replace(/^\/+/, "");
  if (!storageKey) {
    res.status(400).json({ error: "Invalid media path" });
    return;
  }

  try {
    const data = await storage.get(storageKey);
    const ext = path.extname(storageKey).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", data.length);
    // Allow the browser to cache the response for 1 hour but prevent
    // shared/CDN caches from storing authenticated content.
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(data);
  } catch {
    res.status(404).json({ error: "Media not found" });
  }
});
