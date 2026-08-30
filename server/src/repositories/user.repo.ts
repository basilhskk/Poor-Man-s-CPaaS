import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

export type UserRow = typeof users.$inferSelect;

export function createUserRepo(db: Db) {
  return {
    async findByUsername(username: string): Promise<UserRow | undefined> {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      return row;
    },

    async findById(id: string): Promise<UserRow | undefined> {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      return row;
    },

    async insert(data: {
      username: string;
      passwordHash: string;
    }): Promise<UserRow> {
      const [row] = await db.insert(users).values(data).returning();
      return row;
    },

    async findByApiKey(apiKey: string): Promise<UserRow | undefined> {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKey))
        .limit(1);
      return row;
    },

    async setApiKey(id: string, apiKey: string): Promise<void> {
      await db.update(users).set({ apiKey }).where(eq(users.id, id));
    },

    async updateSettings(
      id: string,
      data: Partial<{
        routingStrategy: string;
        healthCheckEnabled: boolean;
        webhookUrl: string | null;
        webhookSecret: string | null;
      }>,
    ): Promise<void> {
      await db.update(users).set(data).where(eq(users.id, id));
    },
  };
}

export type UserRepo = ReturnType<typeof createUserRepo>;
