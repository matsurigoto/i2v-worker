import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
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

  // Catch-all error handler, registered after the cors() middleware and all
  // routes, so unexpected exceptions (e.g. thrown from a route handler)
  // still get a CORS-compliant JSON error response instead of the request
  // hanging/crashing the process before any headers are sent. Without this,
  // such failures surface in the browser purely as an opaque
  // "blocked by CORS policy" or network error, hiding the real cause.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const errorId = crypto.randomUUID();
    // eslint-disable-next-line no-console
    console.error(`Unhandled error while processing request [errorId=${errorId}]:`, err);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ error: "Internal server error", errorId });
  });

  return app;
}

if (require.main === module) {
  // Log crashes with their real cause instead of letting App Service just
  // silently restart the process (which otherwise surfaces to clients as an
  // opaque 502/CORS error with no indication of what actually failed). We
  // still exit after logging: per Node's docs, continuing after an
  // uncaught exception leaves the process in an undefined state, and App
  // Service will restart the worker regardless once it fails.
  process.on("uncaughtException", (err) => {
    // eslint-disable-next-line no-console
    console.error("Uncaught exception:", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    // eslint-disable-next-line no-console
    console.error("Unhandled promise rejection:", reason);
  });

  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`i2v API listening on port ${config.port}`);
    // eslint-disable-next-line no-console
    console.log(`CORS_ORIGIN configured as: ${JSON.stringify(config.corsOrigin)}`);
  });
}
