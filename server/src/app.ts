import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { createDb } from "./db/client.js";
import { createGatewayRouter } from "./router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
}

export function createApp(config: AppConfig) {
  const app = express();
  const db = createDb(config.databaseUrl);

  const isProd = process.env.NODE_ENV === "production";

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin: isProd ? false : true,   // prod: same-origin only; dev: permissive
    credentials: true,
  }));
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  // Rate-limit auth endpoints: 20 req/15 min per IP
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
  app.use("/auth/login", authLimiter);
  app.use("/auth/register", authLimiter);

  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use(
    "/",
    createGatewayRouter({
      db,
      jwtSecret: config.jwtSecret,
    }),
  );

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const isProd = process.env.NODE_ENV === "production";
    res.status(500).json({
      error: isProd ? "Internal server error" : String(err),
    });
  });

  return app;
}
