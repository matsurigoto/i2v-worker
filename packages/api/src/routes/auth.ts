import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { requireAuth, AuthedRequest } from "../middleware/auth";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const validUsername = username === config.authUsername;
  const validPassword = await bcrypt.compare(password, config.authPasswordHash);
  if (!validUsername || !validPassword) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign({ username }, config.jwtSecret, { expiresIn: "12h" });
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    // The Static Web App's linked backend (see infra/bicep/main.bicep)
    // reverse-proxies /api/* to this API from the SWA's own origin, and the
    // Vite dev proxy does the same locally, so the browser always sees the
    // API as same-origin. SameSite=Lax is therefore sufficient in both
    // environments; SameSite=None was previously used in production for the
    // cross-origin SWA → App Service call, but iOS Safari/Chrome's ITP
    // silently drops SameSite=None cookies, which broke login persistence
    // on iPhone.
    sameSite: "lax",
    secure: isProduction,
    maxAge: 12 * 60 * 60 * 1000,
  });
  res.json({ username });
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie(config.cookieName);
  res.status(204).send();
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ username: req.user?.username });
});
