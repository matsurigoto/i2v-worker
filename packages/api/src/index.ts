import express, { type Request } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { config } from "./config";
import { authRouter } from "./routes/auth";
import { storiesRouter } from "./routes/stories";
import { seriesRouter } from "./routes/series";
import { imagesRouter } from "./routes/images";
import { videoJobsRouter, storyVideoJobsRouter } from "./routes/videoJobs";
import { requireAuth } from "./middleware/auth";

// Azure App Service's reverse proxy sometimes appends the client's port to
// the address in `X-Forwarded-For` (e.g. "203.0.113.5:54321" or
// "[2001:db8::1]:54321"), which `req.ip` then reflects verbatim. That makes
// `req.ip` an invalid IP address as far as express-rate-limit is concerned,
// triggering ERR_ERL_INVALID_IP_ADDRESS. Strip the trailing port before
// handing the address to express-rate-limit's key generator.
const IPV4_OCTET = "(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)";
const IPV4_WITH_PORT = new RegExp(`^(${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}\\.${IPV4_OCTET}):\\d+$`);
// IPv6 addresses only contain hex digits and colons (optionally a "%zoneId"
// suffix), so restrict the bracketed capture group accordingly instead of
// accepting arbitrary bracketed text.
const BRACKETED_IPV6_WITH_PORT = /^\[([0-9a-fA-F:]+(?:%[0-9a-zA-Z]+)?)]:\d+$/;

function stripPort(ip: string): string {
  const bracketedIpv6WithPort = ip.match(BRACKETED_IPV6_WITH_PORT);
  if (bracketedIpv6WithPort) return bracketedIpv6WithPort[1];

  const ipv4WithPort = ip.match(IPV4_WITH_PORT);
  if (ipv4WithPort) return ipv4WithPort[1];

  return ip;
}

// Fallback key used when `req.ip` is unavailable (e.g. `trust proxy` is
// misconfigured), so we degrade to a single shared rate-limit bucket instead
// of letting express-rate-limit throw on an empty string. Logged so the
// underlying misconfiguration can be detected and fixed promptly.
const UNKNOWN_IP_KEY = "unknown";

function keyGenerator(req: Request): string {
  if (!req.ip) {
    // eslint-disable-next-line no-console
    console.warn("Rate limiter could not determine req.ip; falling back to a shared bucket.");
    return UNKNOWN_IP_KEY;
  }
  return ipKeyGenerator(stripPort(req.ip));
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
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
  app.use("/api/series", apiLimiter, requireAuth, seriesRouter);
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
