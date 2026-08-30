import type { OutboundRepo, OutboundRow } from '../repositories/outbound.repo.js';
import type { DeviceRepo } from '../repositories/device.repo.js';
import type { UserRepo } from '../repositories/user.repo.js';
import type { SendSmsInput, AckItem } from '../validators/outbound.validator.js';
import { fireWebhook } from '../webhook.js';

export function createOutboundService(
  repo: OutboundRepo,
  deviceRepo: DeviceRepo,
  userRepo: UserRepo,
) {
  async function selectDevice(userId: string, overrideDeviceId?: string): Promise<string> {
    const allDevices = await deviceRepo.listByUser(userId);
    if (allDevices.length === 0) throw Object.assign(new Error('No devices registered'), { code: 'NO_DEVICES' });

    if (overrideDeviceId) {
      const found = allDevices.find((d) => d.id === overrideDeviceId);
      if (!found) throw Object.assign(new Error('Device not found'), { code: 'DEVICE_NOT_FOUND' });
      await deviceRepo.updateLastAssigned(overrideDeviceId);
      return overrideDeviceId;
    }

    const user = await userRepo.findById(userId);
    const routingStrategy = user?.routingStrategy ?? 'least_load';
    const healthCheckEnabled = user?.healthCheckEnabled ?? true;

    const activeThreshold = new Date(Date.now() - 10 * 60 * 1000);
    let active = allDevices.filter((d) => d.lastSeen && d.lastSeen > activeThreshold);

    if (healthCheckEnabled && active.length > 0) {
      const healthMap = await repo.getRecentFailureRates(active.map((d) => d.id));
      const healthy = active.filter((d) => (healthMap.get(d.id) ?? 0) < 0.7);
      if (healthy.length > 0) active = healthy;
    }

    let chosen;
    if (active.length === 0) {
      chosen = allDevices.find((d) => d.isPrimary) ?? allDevices[0];
    } else if (routingStrategy === 'round_robin') {
      chosen = [...active].sort((a, b) => {
        if (!a.lastAssignedAt) return -1;
        if (!b.lastAssignedAt) return 1;
        return a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime();
      })[0];
    } else {
      const pendingCounts = await repo.countPendingByDevice(active.map((d) => d.id));
      chosen = [...active].sort(
        (a, b) => (pendingCounts.get(a.id) ?? 0) - (pendingCounts.get(b.id) ?? 0),
      )[0];
    }

    await deviceRepo.updateLastAssigned(chosen.id);
    return chosen.id;
  }

  return {
    async queue(userId: string, input: SendSmsInput): Promise<OutboundRow> {
      const deviceId = await selectDevice(userId, input.deviceId);
      return repo.insert({
        userId,
        deviceId,
        recipient: input.to,
        body: input.body,
        webhookUrl: input.webhookUrl ?? null,
        status: 'pending',
        attempts: 0,
      });
    },

    async getPending(deviceId: string): Promise<OutboundRow[]> {
      return repo.getPending(deviceId);
    },

    async ackBatch(items: AckItem[], deviceId: string): Promise<void> {
      await Promise.all(
        items.map(async (item) => {
          const sentAt = item.sentAt ? new Date(item.sentAt) : undefined;
          const row = await repo.updateStatus(item.id, item.status, item.reason, sentAt, deviceId);

          if (row?.webhookUrl && (item.status === 'sent' || item.status === 'failed' || item.status === 'dead_letter')) {
            fireWebhook(
              row.webhookUrl,
              item.status === 'sent'
                ? { event: 'sms.sent', data: { id: row.id, to: row.recipient, sentAt: sentAt?.toISOString() } }
                : { event: 'sms.failed', data: { id: row.id, to: row.recipient, reason: item.reason, status: item.status } },
            );
          }
        }),
      );
    },

    async getById(id: string, userId: string): Promise<OutboundRow | undefined> {
      return repo.getById(id, userId);
    },

    async list(options: { userId: string; status?: string; page: number; pageSize: number }): Promise<OutboundRow[]> {
      return repo.list(options);
    },

    async requeueDeadLetter(id: string, userId: string): Promise<OutboundRow | undefined> {
      return repo.requeueDeadLetter(id, userId);
    },
  };
}

export type OutboundService = ReturnType<typeof createOutboundService>;
