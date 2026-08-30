import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { UserRepo } from "../repositories/user.repo.js";
import { RegisterSchema, LoginSchema } from "../validators/auth.validator.js";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

function issueToken(
  user: { id: string; username: string },
  secret: string,
): string {
  return jwt.sign({ id: user.id, username: user.username }, secret, {
    expiresIn: "30d",
  });
}

export function createAuthController(userRepo: UserRepo, jwtSecret: string) {
  return {
    async register(req: Request, res: Response): Promise<void> {
      const parsed = RegisterSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { username, password } = parsed.data;
      const existing = await userRepo.findByUsername(username);
      if (existing) {
        res.status(409).json({ error: "username taken" });
        return;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await userRepo.insert({ username, passwordHash });
      const token = issueToken(user, jwtSecret);
      res.cookie("token", token, COOKIE_OPTS);
      res.status(201).json({ id: user.id, username: user.username });
    },

    async login(req: Request, res: Response): Promise<void> {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { username, password } = parsed.data;
      const user = await userRepo.findByUsername(username);
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const token = issueToken(user, jwtSecret);
      res.cookie("token", token, COOKIE_OPTS);
      res.json({ id: user.id, username: user.username });
    },

    async logout(_req: Request, res: Response): Promise<void> {
      res.clearCookie("token");
      res.json({ ok: true });
    },

    async me(req: Request, res: Response): Promise<void> {
      res.json(req.user);
    },
  };
}
