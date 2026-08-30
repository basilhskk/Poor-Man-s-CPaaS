import type { Request, Response } from "express";
import type { OutboundService } from "../services/outbound.service.js";
import type { ReceivedService } from "../services/received.service.js";
import type { DeviceService } from "../services/device.service.js";
import { AckBatchSchema } from "../validators/outbound.validator.js";
import { ReceivedSmsBatchSchema } from "../validators/received.validator.js";

export function createDeviceController(
  outbound: OutboundService,
  received: ReceivedService,
  device: DeviceService,
) {
  return {
    async ping(req: Request, res: Response): Promise<void> {
      res.json({
        ok: true,
        deviceId: req.device!.id,
        deviceName: req.device!.name,
      });
    },

    async getOutbound(req: Request, res: Response): Promise<void> {
      const deviceId = req.device!.id;
      await device.heartbeat(deviceId);
      const messages = await outbound.getPending(deviceId);
      res.json(
        messages.map((m) => ({ id: m.id, to: m.recipient, body: m.body })),
      );
    },

    async ack(req: Request, res: Response): Promise<void> {
      const parsed = AckBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      await outbound.ackBatch(parsed.data, req.device!.id);
      res.json({ ok: true });
    },

    async receiveSms(req: Request, res: Response): Promise<void> {
      const parsed = ReceivedSmsBatchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      await device.heartbeat(req.device!.id);
      const rows = await received.storeBatch(
        parsed.data,
        req.device!.id,
        req.device!.userId,
      );
      res.status(201).json({ stored: rows.length });
    },
  };
}
