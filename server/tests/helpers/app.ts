import type { Express } from "express";
import { createApp } from "../../src/app.js";

export const TEST_JWT_SECRET = "test-secret";

let app: Express | undefined;

export function getTestApp(): Express {
  if (!app) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL not set — did global-setup run?");
    app = createApp({ databaseUrl: url, jwtSecret: TEST_JWT_SECRET });
  }
  return app;
}
