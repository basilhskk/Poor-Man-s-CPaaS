import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import type { DeviceRepo } from "../repositories/device.repo.js";
import { RegisterDeviceSchema } from "../validators/devices.validator.js";

export function createDevicesController(deviceRepo: DeviceRepo) {
  return {
    async list(req: Request, res: Response): Promise<void> {
      const devices = await deviceRepo.listByUser(req.user!.id);
      res.json(devices.map(({ apiKey: _k, ...d }) => d));
    },

    async register(req: Request, res: Response): Promise<void> {
      const parsed = RegisterDeviceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { name } = parsed.data;
      const apiKey = randomUUID();
      const device = await deviceRepo.insert({ userId: req.user!.id, name, apiKey });
      // apiKey shown once — not returned in list
      res.status(201).json({
        id: device.id,
        name: device.name,
        isPrimary: device.isPrimary,
        createdAt: device.createdAt,
        apiKey,
      });
    },

    async remove(req: Request, res: Response): Promise<void> {
      const deleted = await deviceRepo.deleteById(
        String(req.params.id),
        req.user!.id,
      );
      if (!deleted) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ ok: true });
    },

    async setPrimary(req: Request, res: Response): Promise<void> {
      const devices = await deviceRepo.listByUser(req.user!.id);
      const found = devices.find((d) => d.id === String(req.params.id));
      if (!found) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      await deviceRepo.setPrimary(String(req.params.id), req.user!.id);
      res.json({ ok: true });
    },
  };
}
