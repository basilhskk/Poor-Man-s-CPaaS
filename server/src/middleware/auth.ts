import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRepo } from "../repositories/user.repo.js";
import type { DeviceRepo } from "../repositories/device.repo.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; username: string };
      device?: { id: string; userId: string; name: string };
    }
  }
}

async function resolveUserFromCookie(
  secret: string,
  userRepo: UserRepo,
  req: Request,
): Promise<{ id: string; username: string } | null> {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret) as {
      id: string;
      username: string;
    };
    const user = await userRepo.findById(payload.id);
    return user ? { id: user.id, username: user.username } : null;
  } catch {
    return null;
  }
}

async function resolveUserFromApiKey(
  userRepo: UserRepo,
  req: Request,
): Promise<{ id: string; username: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const key = auth.slice(7);
  if (!key.startsWith("pmk_")) return null;
  const user = await userRepo.findByApiKey(key);
  return user ? { id: user.id, username: user.username } : null;
}

export function sessionMiddleware(secret: string, userRepo: UserRepo) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const user = await resolveUserFromCookie(secret, userRepo, req);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = user;
    next();
  };
}

export function userAuthMiddleware(secret: string, userRepo: UserRepo) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const user =
      (await resolveUserFromCookie(secret, userRepo, req)) ??
      (await resolveUserFromApiKey(userRepo, req));
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = user;
    next();
  };
}

export function deviceKeyMiddleware(deviceRepo: DeviceRepo) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || typeof apiKey !== "string") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const device = await deviceRepo.getByApiKey(apiKey);
    if (!device) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.device = { id: device.id, userId: device.userId, name: device.name };
    next();
  };
}
