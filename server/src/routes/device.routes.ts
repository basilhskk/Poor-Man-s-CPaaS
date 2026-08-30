import { Router } from "express";
import type { RequestHandler } from "express";

export function createDeviceRouter(ctrl: {
  ping: RequestHandler;
  getOutbound: RequestHandler;
  ack: RequestHandler;
  receiveSms: RequestHandler;
}): Router {
  const router = Router();
  router.get("/ping", ctrl.ping);
  router.get("/sms/outbound", ctrl.getOutbound);
  router.post("/sms/ack", ctrl.ack);
  router.post("/sms/received", ctrl.receiveSms);
  return router;
}
