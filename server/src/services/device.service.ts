import type { DeviceRepo } from '../repositories/device.repo.js';

export function createDeviceService(repo: DeviceRepo) {
  return {
    async heartbeat(deviceId: string): Promise<void> {
      await repo.heartbeat(deviceId);
    },

    async health(): Promise<{ db: boolean }> {
      try {
        await repo.ping();
        return { db: true };
      } catch {
        return { db: false };
      }
    },
  };
}

export type DeviceService = ReturnType<typeof createDeviceService>;
