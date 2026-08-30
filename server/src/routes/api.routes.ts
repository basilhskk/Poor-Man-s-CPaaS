import { Router } from "express";
import type { RequestHandler } from "express";

export function createApiRouter(ctrl: {
  send: RequestHandler;
  getById: RequestHandler;
  listOutbox: RequestHandler;
  listInbox: RequestHandler;
  retry: RequestHandler;
  stats: RequestHandler;
  getSettings: RequestHandler;
  updateSettings: RequestHandler;
  generateWebhookSecret: RequestHandler;
  generateApiKey: RequestHandler;
}): Router {
  const router = Router();
  router.get("/stats", ctrl.stats);
  router.get("/settings", ctrl.getSettings);
  router.put("/settings", ctrl.updateSettings);
  router.post("/settings/webhook-secret", ctrl.generateWebhookSecret);
  router.post("/settings/api-key", ctrl.generateApiKey);
  router.post("/sms/send", ctrl.send);
  router.get("/sms/outbox", ctrl.listOutbox);
  router.get("/sms/inbox", ctrl.listInbox);
  router.get("/sms/:id", ctrl.getById);
  router.post("/sms/:id/retry", ctrl.retry);
  return router;
}
