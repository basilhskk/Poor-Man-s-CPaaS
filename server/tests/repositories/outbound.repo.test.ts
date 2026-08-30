import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb, truncateAll } from "../helpers/db.js";
import { createTestUser, createTestDevice } from "../helpers/factories.js";
import { createOutboundRepo } from "../../src/repositories/outbound.repo.js";

const db = getTestDb();
const repo = createOutboundRepo(db);

beforeEach(async () => {
  await truncateAll(db);
});

async function setupUserAndDevice() {
  const user = await createTestUser(db);
  const device = await createTestDevice(db, user.id);
  return { user, device };
}

describe("outbound.repo", () => {
  it("inserts and retrieves a message by id, scoped to its owning user", async () => {
    const { user, device } = await setupUserAndDevice();
    const row = await repo.insert({
      userId: user.id,
      deviceId: device.id,
      recipient: "+12125551234",
      body: "hi",
      status: "pending",
      attempts: 0,
    });

    await expect(repo.getById(row.id)).resolves.toMatchObject({ id: row.id });
    await expect(repo.getById(row.id, user.id)).resolves.toMatchObject({ id: row.id });
    const otherUser = await createTestUser(db);
    await expect(repo.getById(row.id, otherUser.id)).resolves.toBeUndefined();
  });

  it("getPending returns only pending messages for the given device, oldest first", async () => {
    const { user, device } = await setupUserAndDevice();
    const first = await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: "1", status: "pending", attempts: 0 });
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+2", body: "2", status: "sent", attempts: 0 });
    const third = await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+3", body: "3", status: "pending", attempts: 0 });

    const pending = await repo.getPending(device.id);
    expect(pending.map((r) => r.id)).toEqual([first.id, third.id]);
  });

  it("countPendingByDevice groups pending counts per device", async () => {
    const { user, device: deviceA } = await setupUserAndDevice();
    const deviceB = await createTestDevice(db, user.id);
    await repo.insert({ userId: user.id, deviceId: deviceA.id, recipient: "+1", body: "1", status: "pending", attempts: 0 });
    await repo.insert({ userId: user.id, deviceId: deviceA.id, recipient: "+2", body: "2", status: "pending", attempts: 0 });
    await repo.insert({ userId: user.id, deviceId: deviceB.id, recipient: "+3", body: "3", status: "sent", attempts: 0 });

    const counts = await repo.countPendingByDevice([deviceA.id, deviceB.id]);
    expect(counts.get(deviceA.id)).toBe(2);
    expect(counts.get(deviceB.id) ?? 0).toBe(0);
  });

  it("countPendingByDevice returns an empty map for an empty input", async () => {
    await expect(repo.countPendingByDevice([])).resolves.toEqual(new Map());
  });

  it("getRecentFailureRates computes failure ratio over the last 10 non-pending messages", async () => {
    const { user, device } = await setupUserAndDevice();
    // 3 failed, 1 sent among resolved messages -> 0.75 failure rate
    for (const status of ["failed", "failed", "failed", "sent"]) {
      await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: status, status, attempts: 1 });
    }
    // pending messages must be excluded from the ratio
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: "p", status: "pending", attempts: 0 });

    const rates = await repo.getRecentFailureRates([device.id]);
    expect(rates.get(device.id)).toBeCloseTo(0.75);
  });

  it("getRecentFailureRates reports 0 for a device with no resolved messages", async () => {
    const { device } = await setupUserAndDevice();
    const rates = await repo.getRecentFailureRates([device.id]);
    expect(rates.get(device.id)).toBe(0);
  });

  it("updateStatus updates fields and can be scoped to a device", async () => {
    const { user, device } = await setupUserAndDevice();
    const row = await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: "1", status: "pending", attempts: 0 });

    const otherDevice = await createTestDevice(db, user.id);
    await expect(repo.updateStatus(row.id, "sent", null, new Date(), otherDevice.id)).resolves.toBeUndefined();

    const updated = await repo.updateStatus(row.id, "sent", null, new Date(), device.id);
    expect(updated?.status).toBe("sent");
  });

  it("list filters by user and optional status, newest first", async () => {
    const { user, device } = await setupUserAndDevice();
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: "a", status: "pending", attempts: 0 });
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+2", body: "b", status: "sent", attempts: 0 });

    const all = await repo.list({ userId: user.id, page: 1, pageSize: 20 });
    expect(all).toHaveLength(2);

    const sentOnly = await repo.list({ userId: user.id, status: "sent", page: 1, pageSize: 20 });
    expect(sentOnly).toHaveLength(1);
    expect(sentOnly[0].body).toBe("b");
  });

  it("getStatsByUser groups counts by device and status", async () => {
    const { user, device } = await setupUserAndDevice();
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: "a", status: "sent", attempts: 0 });
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+2", body: "b", status: "sent", attempts: 0 });
    await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+3", body: "c", status: "failed", attempts: 1 });

    const stats = await repo.getStatsByUser(user.id);
    const sentStat = stats.find((s) => s.status === "sent");
    const failedStat = stats.find((s) => s.status === "failed");
    expect(sentStat?.cnt).toBe(2);
    expect(failedStat?.cnt).toBe(1);
  });

  it("requeueDeadLetter only transitions messages actually in dead_letter state", async () => {
    const { user, device } = await setupUserAndDevice();
    const pending = await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+1", body: "a", status: "pending", attempts: 0 });
    const dead = await repo.insert({ userId: user.id, deviceId: device.id, recipient: "+2", body: "b", status: "dead_letter", attempts: 5, failureReason: "boom" });

    await expect(repo.requeueDeadLetter(pending.id, user.id)).resolves.toBeUndefined();

    const requeued = await repo.requeueDeadLetter(dead.id, user.id);
    expect(requeued?.status).toBe("pending");
    expect(requeued?.failureReason).toBeNull();
  });
});
