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
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "none",
    secure: process.env.NODE_ENV === "production",
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
