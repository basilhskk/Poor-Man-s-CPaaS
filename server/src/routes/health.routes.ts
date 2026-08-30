import { Router } from "express";
import type { RequestHandler } from "express";

export function createHealthRouter(ctrl: { check: RequestHandler }): Router {
  const router = Router();
  router.get("/", ctrl.check);
  return router;
}
