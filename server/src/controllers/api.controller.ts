import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import { isSafeWebhookUrl } from "../utils/url.js";
import type { OutboundService } from "../services/outbound.service.js";
import type { ReceivedService } from "../services/received.service.js";
import type { UserRepo } from "../repositories/user.repo.js";
import type { DeviceRepo } from "../repositories/device.repo.js";
import type { OutboundRepo } from "../repositories/outbound.repo.js";
import type { ReceivedRepo } from "../repositories/received.repo.js";
import { SendSmsSchema } from "../validators/outbound.validator.js";
import { UpdateSettingsSchema } from "../validators/settings.validator.js";

export function createApiController(
  outbound: OutboundService,
  received: ReceivedService,
  deviceRepo: DeviceRepo,
  outboundRepo: OutboundRepo,
  receivedRepo: ReceivedRepo,
  userRepo: UserRepo,
) {
  return {
    async send(req: Request, res: Response): Promise<void> {
      const parsed = SendSmsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      if (
        parsed.data.webhookUrl &&
        !(await isSafeWebhookUrl(parsed.data.webhookUrl))
      ) {
        res
          .status(400)
          .json({ error: "webhookUrl must be a reachable public address" });
        return;
      }
      try {
        const row = await outbound.queue(req.user!.id, parsed.data);
        res
          .status(201)
          .json({ id: row.id, status: row.status, deviceId: row.deviceId });
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "NO_DEVICES") {
          res.status(422).json({ error: "No devices registered" });
        } else if (code === "DEVICE_NOT_FOUND") {
          res.status(404).json({ error: "Device not found" });
        } else {
          throw err;
        }
      }
    },

    async getById(req: Request, res: Response): Promise<void> {
      const row = await outbound.getById(String(req.params.id), req.user!.id);
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(row);
    },

    async listOutbox(req: Request, res: Response): Promise<void> {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, Number(req.query.pageSize) || 20),
      );
      const VALID_STATUSES = ["pending", "sent", "failed", "dead_letter"];
      const rawStatus =
        typeof req.query.status === "string" ? req.query.status : undefined;
      const status =
        rawStatus && VALID_STATUSES.includes(rawStatus) ? rawStatus : undefined;
      const rows = await outbound.list({
        userId: req.user!.id,
        status,
        page,
        pageSize,
      });
      res.json(rows);
    },

    async listInbox(req: Request, res: Response): Promise<void> {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, Number(req.query.pageSize) || 20),
      );
      const rows = await received.listByUser(req.user!.id, { page, pageSize });
      res.json(rows);
    },

    async stats(req: Request, res: Response): Promise<void> {
      const userId = req.user!.id;
      const [devList, outStats, rxStats] = await Promise.all([
        deviceRepo.listByUser(userId),
        outboundRepo.getStatsByUser(userId),
        receivedRepo.countReceivedByDevice(userId),
      ]);

      const devMap = new Map(
        devList.map((d) => [
          d.id,
          {
            id: d.id,
            name: d.name,
            isPrimary: d.isPrimary,
            lastSeen: d.lastSeen,
            sent: 0,
            pending: 0,
            failed: 0,
            deadLetter: 0,
            received: 0,
          },
        ]),
      );

      for (const r of outStats) {
        const dev = devMap.get(r.deviceId);
        if (!dev) continue;
        if (r.status === "sent") dev.sent += r.cnt;
        else if (r.status === "pending") dev.pending += r.cnt;
        else if (r.status === "failed") dev.failed += r.cnt;
        else if (r.status === "dead_letter") dev.deadLetter += r.cnt;
      }
      for (const r of rxStats) {
        const dev = devMap.get(r.deviceId);
        if (dev) dev.received += r.cnt;
      }

      const devs = [...devMap.values()];
      res.json({
        totals: {
          sent: devs.reduce((s, d) => s + d.sent, 0),
          pending: devs.reduce((s, d) => s + d.pending, 0),
          failed: devs.reduce((s, d) => s + d.failed, 0),
          deadLetter: devs.reduce((s, d) => s + d.deadLetter, 0),
          received: devs.reduce((s, d) => s + d.received, 0),
        },
        devices: devs,
      });
    },

    async retry(req: Request, res: Response): Promise<void> {
      const row = await outbound.requeueDeadLetter(
        String(req.params.id),
        req.user!.id,
      );
      if (!row) {
        res
          .status(404)
          .json({ error: "Not found or not in dead_letter state" });
        return;
      }
      res.json(row);
    },

    async getSettings(req: Request, res: Response): Promise<void> {
      const user = await userRepo.findById(req.user!.id);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({
        routingStrategy: user.routingStrategy,
        healthCheckEnabled: user.healthCheckEnabled,
        webhookUrl: user.webhookUrl ?? null,
        webhookSecretSet: !!user.webhookSecret,
        apiKeySet: !!user.apiKey,
      });
    },

    async updateSettings(req: Request, res: Response): Promise<void> {
      const parsed = UpdateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const { routingStrategy, healthCheckEnabled, webhookUrl } = parsed.data;
      if (webhookUrl && !(await isSafeWebhookUrl(webhookUrl))) {
        res.status(400).json({ error: 'Webhook URL must be a reachable public https/http address' });
        return;
      }
      const patch: Parameters<typeof userRepo.updateSettings>[1] = {};
      if (routingStrategy !== undefined) patch.routingStrategy = routingStrategy;
      if (healthCheckEnabled !== undefined) patch.healthCheckEnabled = healthCheckEnabled;
      if (webhookUrl !== undefined) patch.webhookUrl = webhookUrl ?? null;
      await userRepo.updateSettings(req.user!.id, patch);
      res.json({ ok: true });
    },

    async generateWebhookSecret(req: Request, res: Response): Promise<void> {
      const secret = randomBytes(32).toString("hex");
      await userRepo.updateSettings(req.user!.id, { webhookSecret: secret });
      res.json({ webhookSecret: secret });
    },

    async generateApiKey(req: Request, res: Response): Promise<void> {
      const apiKey = "pmk_" + randomBytes(32).toString("hex");
      await userRepo.setApiKey(req.user!.id, apiKey);
      res.json({ apiKey });
    },
  };
}
