import { eq, and, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { devices } from "../db/schema.js";

export type DeviceRow = typeof devices.$inferSelect;

export function createDeviceRepo(db: Db) {
  return {
    async getByApiKey(apiKey: string): Promise<DeviceRow | undefined> {
      const [row] = await db
        .select()
        .from(devices)
        .where(eq(devices.apiKey, apiKey))
        .limit(1);
      return row;
    },

    async listByUser(userId: string): Promise<DeviceRow[]> {
      return db.select().from(devices).where(eq(devices.userId, userId));
    },

    async getPrimary(userId: string): Promise<DeviceRow | undefined> {
      const [row] = await db
        .select()
        .from(devices)
        .where(and(eq(devices.userId, userId), eq(devices.isPrimary, true)))
        .limit(1);
      return row;
    },

    async insert(data: {
      userId: string;
      name: string;
      apiKey: string;
    }): Promise<DeviceRow> {
      return db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: devices.id })
          .from(devices)
          .where(eq(devices.userId, data.userId))
          .limit(1);
        const isPrimary = existing.length === 0;
        const [row] = await tx
          .insert(devices)
          .values({ ...data, isPrimary })
          .returning();
        return row;
      });
    },

    async deleteById(id: string, userId: string): Promise<boolean> {
      const result = await db
        .delete(devices)
        .where(and(eq(devices.id, id), eq(devices.userId, userId)))
        .returning();
      return result.length > 0;
    },

    async setPrimary(deviceId: string, userId: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx
          .update(devices)
          .set({ isPrimary: false })
          .where(eq(devices.userId, userId));
        await tx
          .update(devices)
          .set({ isPrimary: true })
          .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
      });
    },

    async heartbeat(deviceId: string): Promise<void> {
      await db
        .update(devices)
        .set({ lastSeen: new Date() })
        .where(eq(devices.id, deviceId));
    },

    async updateLastAssigned(deviceId: string): Promise<void> {
      await db
        .update(devices)
        .set({ lastAssignedAt: new Date() })
        .where(eq(devices.id, deviceId));
    },

    async ping(): Promise<void> {
      await db.execute(sql`SELECT 1`);
    },
  };
}

export type DeviceRepo = ReturnType<typeof createDeviceRepo>;
