import { eq, and, desc, asc, inArray, ne, count } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { smsOutbound } from "../db/schema.js";

export type OutboundRow = typeof smsOutbound.$inferSelect;
export type NewOutbound = typeof smsOutbound.$inferInsert;

export function createOutboundRepo(db: Db) {
  return {
    async insert(
      data: Omit<NewOutbound, "id" | "createdAt" | "updatedAt">,
    ): Promise<OutboundRow> {
      const [row] = await db.insert(smsOutbound).values(data).returning();
      return row;
    },

    async getPending(deviceId: string, limit = 50): Promise<OutboundRow[]> {
      return db
        .select()
        .from(smsOutbound)
        .where(
          and(
            eq(smsOutbound.deviceId, deviceId),
            eq(smsOutbound.status, "pending"),
          ),
        )
        .orderBy(asc(smsOutbound.createdAt))
        .limit(limit);
    },

    async countPendingByDevice(
      deviceIds: string[],
    ): Promise<Map<string, number>> {
      if (deviceIds.length === 0) return new Map();
      const rows = await db
        .select({ deviceId: smsOutbound.deviceId, cnt: count() })
        .from(smsOutbound)
        .where(
          and(
            inArray(smsOutbound.deviceId, deviceIds),
            eq(smsOutbound.status, "pending"),
          ),
        )
        .groupBy(smsOutbound.deviceId);
      return new Map(rows.map((r) => [r.deviceId, Number(r.cnt)]));
    },

    async getRecentFailureRates(
      deviceIds: string[],
    ): Promise<Map<string, number>> {
      if (deviceIds.length === 0) return new Map();
      const map = new Map<string, number>();
      for (const deviceId of deviceIds) {
        const recent = await db
          .select({ status: smsOutbound.status })
          .from(smsOutbound)
          .where(
            and(
              eq(smsOutbound.deviceId, deviceId),
              ne(smsOutbound.status, "pending"),
            ),
          )
          .orderBy(desc(smsOutbound.updatedAt))
          .limit(10);
        if (recent.length === 0) {
          map.set(deviceId, 0);
        } else {
          const failures = recent.filter(
            (r) => r.status === "failed" || r.status === "dead_letter",
          ).length;
          map.set(deviceId, failures / recent.length);
        }
      }
      return map;
    },

    async updateStatus(
      id: string,
      status: string,
      failureReason?: string | null,
      sentAt?: Date,
      deviceId?: string,
    ): Promise<OutboundRow | undefined> {
      const condition = deviceId
        ? and(eq(smsOutbound.id, id), eq(smsOutbound.deviceId, deviceId))
        : eq(smsOutbound.id, id);
      const [row] = await db
        .update(smsOutbound)
        .set({
          status,
          failureReason: failureReason ?? null,
          sentAt: sentAt ?? null,
          updatedAt: new Date(),
        })
        .where(condition)
        .returning();
      return row;
    },

    async getById(
      id: string,
      userId?: string,
    ): Promise<OutboundRow | undefined> {
      const conditions = userId
        ? [eq(smsOutbound.id, id), eq(smsOutbound.userId, userId)]
        : [eq(smsOutbound.id, id)];
      const [row] = await db
        .select()
        .from(smsOutbound)
        .where(and(...conditions));
      return row;
    },

    async list(options: {
      userId: string;
      status?: string;
      page: number;
      pageSize: number;
    }): Promise<OutboundRow[]> {
      const offset = (options.page - 1) * options.pageSize;
      const conditions = [
        eq(smsOutbound.userId, options.userId),
        ...(options.status ? [eq(smsOutbound.status, options.status)] : []),
      ];
      return db
        .select()
        .from(smsOutbound)
        .where(and(...conditions))
        .orderBy(desc(smsOutbound.createdAt))
        .limit(options.pageSize)
        .offset(offset);
    },

    async getStatsByUser(
      userId: string,
    ): Promise<{ deviceId: string; status: string; cnt: number }[]> {
      const rows = await db
        .select({
          deviceId: smsOutbound.deviceId,
          status: smsOutbound.status,
          cnt: count(),
        })
        .from(smsOutbound)
        .where(eq(smsOutbound.userId, userId))
        .groupBy(smsOutbound.deviceId, smsOutbound.status);
      return rows.map((r) => ({
        deviceId: r.deviceId,
        status: r.status,
        cnt: Number(r.cnt),
      }));
    },

    async requeueDeadLetter(
      id: string,
      userId: string,
    ): Promise<OutboundRow | undefined> {
      const [row] = await db
        .update(smsOutbound)
        .set({ status: "pending", failureReason: null, updatedAt: new Date() })
        .where(
          and(
            eq(smsOutbound.id, id),
            eq(smsOutbound.userId, userId),
            eq(smsOutbound.status, "dead_letter"),
          ),
        )
        .returning();
      return row;
    },
  };
}

export type OutboundRepo = ReturnType<typeof createOutboundRepo>;
