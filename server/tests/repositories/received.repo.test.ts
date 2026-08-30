import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb, truncateAll } from "../helpers/db.js";
import { createTestUser, createTestDevice } from "../helpers/factories.js";
import { createReceivedRepo } from "../../src/repositories/received.repo.js";

const db = getTestDb();
const repo = createReceivedRepo(db);

beforeEach(async () => {
  await truncateAll(db);
});

describe("received.repo", () => {
  it("inserts a received message", async () => {
    const user = await createTestUser(db);
    const device = await createTestDevice(db, user.id);

    const row = await repo.insert({
      deviceId: device.id,
      fromNumber: "+15551234567",
      body: "hello",
      receivedAt: new Date(),
      webhookDelivered: false,
    });

    expect(row.fromNumber).toBe("+15551234567");
    expect(row.webhookDelivered).toBe(false);
  });

  it("listByUser only returns messages for devices owned by that user, newest first", async () => {
    const userA = await createTestUser(db);
    const userB = await createTestUser(db);
    const deviceA = await createTestDevice(db, userA.id);
    const deviceB = await createTestDevice(db, userB.id);

    const older = await repo.insert({ deviceId: deviceA.id, fromNumber: "+1", body: "old", receivedAt: new Date(Date.now() - 60_000), webhookDelivered: false });
    const newer = await repo.insert({ deviceId: deviceA.id, fromNumber: "+1", body: "new", receivedAt: new Date(), webhookDelivered: false });
    await repo.insert({ deviceId: deviceB.id, fromNumber: "+2", body: "other user", receivedAt: new Date(), webhookDelivered: false });

    const rows = await repo.listByUser(userA.id, { page: 1, pageSize: 20 });
    expect(rows.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it("countReceivedByDevice groups counts scoped to the user's own devices", async () => {
    const userA = await createTestUser(db);
    const userB = await createTestUser(db);
    const deviceA = await createTestDevice(db, userA.id);
    const deviceB = await createTestDevice(db, userB.id);

    await repo.insert({ deviceId: deviceA.id, fromNumber: "+1", body: "a", receivedAt: new Date(), webhookDelivered: false });
    await repo.insert({ deviceId: deviceA.id, fromNumber: "+1", body: "b", receivedAt: new Date(), webhookDelivered: false });
    await repo.insert({ deviceId: deviceB.id, fromNumber: "+2", body: "c", receivedAt: new Date(), webhookDelivered: false });

    const countsA = await repo.countReceivedByDevice(userA.id);
    expect(countsA).toEqual([{ deviceId: deviceA.id, cnt: 2 }]);
  });

  it("markDelivered flips the webhookDelivered flag", async () => {
    const user = await createTestUser(db);
    const device = await createTestDevice(db, user.id);
    const row = await repo.insert({ deviceId: device.id, fromNumber: "+1", body: "a", receivedAt: new Date(), webhookDelivered: false });

    await repo.markDelivered(row.id);

    const [updated] = await repo.listByUser(user.id, { page: 1, pageSize: 20 });
    expect(updated.webhookDelivered).toBe(true);
  });
});
