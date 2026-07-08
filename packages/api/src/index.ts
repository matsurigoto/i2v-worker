import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { storiesRouter } from "./routes/stories";
import { imagesRouter } from "./routes/images";
import { videoJobsRouter, storyVideoJobsRouter } from "./routes/videoJobs";
import { requireAuth } from "./middleware/auth";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp() {
  const app = express();

  // Trust the configured number of proxy hops so `req.ip` (and therefore
  // express-rate-limit) correctly reflects the real client IP from
  // `X-Forwarded-For` instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  app.set("trust proxy", config.trustProxy);

  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(config.mediaPublicBasePath, express.static(config.mediaRootDir));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authLimiter, authRouter);

  // Everything below requires an authenticated session.
  app.use("/api/stories", apiLimiter, requireAuth, storiesRouter);
  app.use("/api/stories/:storyId/videojobs", apiLimiter, requireAuth, storyVideoJobsRouter);
  app.use("/api/images", apiLimiter, requireAuth, imagesRouter);
  app.use("/api/videojobs", apiLimiter, requireAuth, videoJobsRouter);

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`i2v API listening on port ${config.port}`);
  });
}
