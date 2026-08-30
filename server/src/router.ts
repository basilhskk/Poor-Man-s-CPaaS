import { Router } from 'express';
import type { Db } from './db/client.js';
import { createOutboundRepo } from './repositories/outbound.repo.js';
import { createReceivedRepo } from './repositories/received.repo.js';
import { createDeviceRepo } from './repositories/device.repo.js';
import { createUserRepo } from './repositories/user.repo.js';
import { createOutboundService } from './services/outbound.service.js';
import { createReceivedService } from './services/received.service.js';
import { createDeviceService } from './services/device.service.js';
import { createDeviceController } from './controllers/device.controller.js';
import { createApiController } from './controllers/api.controller.js';
import { createHealthController } from './controllers/health.controller.js';
import { createAuthController } from './controllers/auth.controller.js';
import { createDevicesController } from './controllers/devices.controller.js';
import { createDeviceRouter } from './routes/device.routes.js';
import { createApiRouter } from './routes/api.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createDevicesRouter } from './routes/devices.routes.js';
import { sessionMiddleware, userAuthMiddleware, deviceKeyMiddleware } from './middleware/auth.js';

export interface GatewayRouterConfig {
  db: Db;
  jwtSecret: string;
}

export function createGatewayRouter(config: GatewayRouterConfig): Router {
  const outboundRepo = createOutboundRepo(config.db);
  const receivedRepo = createReceivedRepo(config.db);
  const deviceRepo = createDeviceRepo(config.db);
  const userRepo = createUserRepo(config.db);

  const outboundSvc = createOutboundService(outboundRepo, deviceRepo, userRepo);
  const receivedSvc = createReceivedService(receivedRepo, userRepo);
  const deviceSvc = createDeviceService(deviceRepo);

  const deviceCtrl = createDeviceController(outboundSvc, receivedSvc, deviceSvc);
  const apiCtrl = createApiController(outboundSvc, receivedSvc, deviceRepo, outboundRepo, receivedRepo, userRepo);
  const healthCtrl = createHealthController(deviceSvc);
  const authCtrl = createAuthController(userRepo, config.jwtSecret);
  const devicesCtrl = createDevicesController(deviceRepo);

  const sessionMw = sessionMiddleware(config.jwtSecret, userRepo);
  const userAuthMw = userAuthMiddleware(config.jwtSecret, userRepo);
  const deviceKeyMw = deviceKeyMiddleware(deviceRepo);

  const router = Router();

  router.use('/auth', createAuthRouter(authCtrl, sessionMw));
  router.use('/devices', userAuthMw, createDevicesRouter(devicesCtrl));
  router.use('/device', deviceKeyMw, createDeviceRouter(deviceCtrl));
  router.use('/api', userAuthMw, createApiRouter(apiCtrl));
  router.use('/health', createHealthRouter(healthCtrl));

  return router;
}
