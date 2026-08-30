import { createDb, type Db } from "../../src/db/client.js";
import { sql } from "drizzle-orm";

let db: Db | undefined;

export function getTestDb(): Db {
  if (!db) {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error("TEST_DATABASE_URL not set — did global-setup run?");
    db = createDb(url);
  }
  return db;
}

export async function truncateAll(database: Db = getTestDb()): Promise<void> {
  await database.execute(
    sql`TRUNCATE TABLE sms_received, sms_outbound, devices, users RESTART IDENTITY CASCADE`,
  );
}
