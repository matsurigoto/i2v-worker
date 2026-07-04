import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { storiesRouter } from "./routes/stories";
import { imagesRouter } from "./routes/images";
import { videoJobsRouter, storyVideoJobsRouter } from "./routes/videoJobs";
import { requireAuth } from "./middleware/auth";

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(config.mediaPublicBasePath, express.static(config.mediaRootDir));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRouter);

  // Everything below requires an authenticated session.
  app.use("/api/stories", requireAuth, storiesRouter);
  app.use("/api/stories/:storyId/videojobs", requireAuth, storyVideoJobsRouter);
  app.use("/api/images", requireAuth, imagesRouter);
  app.use("/api/videojobs", requireAuth, videoJobsRouter);

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`i2v API listening on port ${config.port}`);
  });
}
