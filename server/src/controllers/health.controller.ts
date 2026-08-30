import type { Request, Response } from "express";
import type { DeviceService } from "../services/device.service.js";

export function createHealthController(device: DeviceService) {
  return {
    async check(_req: Request, res: Response): Promise<void> {
      const status = await device.health();
      res.status(status.db ? 200 : 503).json(status);
    },
  };
}
