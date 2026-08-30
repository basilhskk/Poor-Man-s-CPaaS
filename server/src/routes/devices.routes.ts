import { Router } from "express";
import type { RequestHandler } from "express";

export function createDevicesRouter(ctrl: {
  list: RequestHandler;
  register: RequestHandler;
  remove: RequestHandler;
  setPrimary: RequestHandler;
}): Router {
  const router = Router();
  router.get("/", ctrl.list);
  router.post("/", ctrl.register);
  router.delete("/:id", ctrl.remove);
  router.post("/:id/primary", ctrl.setPrimary);
  return router;
}
