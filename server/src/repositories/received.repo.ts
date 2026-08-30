import { eq, desc, getTableColumns, count } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { smsReceived, devices } from "../db/schema.js";

export type ReceivedRow = typeof smsReceived.$inferSelect;
export type NewReceived = typeof smsReceived.$inferInsert;

export function createReceivedRepo(db: Db) {
  const receivedCols = getTableColumns(smsReceived);

  return {
    async insert(
      data: Omit<NewReceived, "id" | "createdAt">,
    ): Promise<ReceivedRow> {
      const [row] = await db.insert(smsReceived).values(data).returning();
      return row;
    },

    async listByUser(
      userId: string,
      options: { page: number; pageSize: number },
    ): Promise<ReceivedRow[]> {
      return db
        .select(receivedCols)
        .from(smsReceived)
        .innerJoin(devices, eq(smsReceived.deviceId, devices.id))
        .where(eq(devices.userId, userId))
        .orderBy(desc(smsReceived.receivedAt))
        .limit(options.pageSize)
        .offset((options.page - 1) * options.pageSize) as Promise<
        ReceivedRow[]
      >;
    },

    async countReceivedByDevice(
      userId: string,
    ): Promise<{ deviceId: string; cnt: number }[]> {
      const rows = await db
        .select({ deviceId: smsReceived.deviceId, cnt: count() })
        .from(smsReceived)
        .innerJoin(devices, eq(smsReceived.deviceId, devices.id))
        .where(eq(devices.userId, userId))
        .groupBy(smsReceived.deviceId);
      return rows.map((r) => ({ deviceId: r.deviceId, cnt: Number(r.cnt) }));
    },

    async markDelivered(id: string): Promise<void> {
      await db
        .update(smsReceived)
        .set({ webhookDelivered: true })
        .where(eq(smsReceived.id, id));
    },
  };
}

export type ReceivedRepo = ReturnType<typeof createReceivedRepo>;
