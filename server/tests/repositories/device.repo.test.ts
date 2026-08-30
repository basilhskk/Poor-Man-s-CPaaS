import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb, truncateAll } from "../helpers/db.js";
import { createTestUser } from "../helpers/factories.js";
import { createDeviceRepo } from "../../src/repositories/device.repo.js";

const db = getTestDb();
const repo = createDeviceRepo(db);

beforeEach(async () => {
  await truncateAll(db);
});

describe("device.repo", () => {
  it("marks the first device for a user primary, subsequent ones not", async () => {
    const user = await createTestUser(db);

    const first = await repo.insert({ userId: user.id, name: "phone-1", apiKey: "k1" });
    const second = await repo.insert({ userId: user.id, name: "phone-2", apiKey: "k2" });

    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);
  });

  it("finds a device by api key, and returns undefined when unknown", async () => {
    const user = await createTestUser(db);
    const device = await repo.insert({ userId: user.id, name: "phone", apiKey: "known-key" });

    await expect(repo.getByApiKey("known-key")).resolves.toMatchObject({ id: device.id });
    await expect(repo.getByApiKey("nope")).resolves.toBeUndefined();
  });

  it("lists only devices belonging to the given user", async () => {
    const userA = await createTestUser(db);
    const userB = await createTestUser(db);
    await repo.insert({ userId: userA.id, name: "a1", apiKey: "ka1" });
    await repo.insert({ userId: userB.id, name: "b1", apiKey: "kb1" });

    const listA = await repo.listByUser(userA.id);
    expect(listA).toHaveLength(1);
    expect(listA[0].name).toBe("a1");
  });

  it("returns the primary device for a user", async () => {
    const user = await createTestUser(db);
    const primary = await repo.insert({ userId: user.id, name: "primary", apiKey: "kp" });
    await repo.insert({ userId: user.id, name: "secondary", apiKey: "ks" });

    await expect(repo.getPrimary(user.id)).resolves.toMatchObject({ id: primary.id });
  });

  it("setPrimary flips exactly one device to primary, scoped to the owning user", async () => {
    const userA = await createTestUser(db);
    const userB = await createTestUser(db);
    const a1 = await repo.insert({ userId: userA.id, name: "a1", apiKey: "ka1" });
    const a2 = await repo.insert({ userId: userA.id, name: "a2", apiKey: "ka2" });
    const b1 = await repo.insert({ userId: userB.id, name: "b1", apiKey: "kb1" });

    await repo.setPrimary(a2.id, userA.id);

    const listA = await repo.listByUser(userA.id);
    expect(listA.find((d) => d.id === a1.id)?.isPrimary).toBe(false);
    expect(listA.find((d) => d.id === a2.id)?.isPrimary).toBe(true);
    // other user's device untouched
    const listB = await repo.listByUser(userB.id);
    expect(listB.find((d) => d.id === b1.id)?.isPrimary).toBe(true);
  });

  it("is a no-op, leaving the existing primary untouched, when the target device belongs to someone else", async () => {
    const userA = await createTestUser(db);
    const userB = await createTestUser(db);
    const a1 = await repo.insert({ userId: userA.id, name: "a1", apiKey: "ka1" });
    const b1 = await repo.insert({ userId: userB.id, name: "b1", apiKey: "kb1" });

    await repo.setPrimary(b1.id, userA.id);

    const listA = await repo.listByUser(userA.id);
    expect(listA.find((d) => d.id === a1.id)?.isPrimary).toBe(true);
    const listB = await repo.listByUser(userB.id);
    expect(listB.find((d) => d.id === b1.id)?.isPrimary).toBe(true);
  });

  it("deleteById only deletes when the device belongs to the given user", async () => {
    const userA = await createTestUser(db);
    const userB = await createTestUser(db);
    const device = await repo.insert({ userId: userA.id, name: "a1", apiKey: "ka1" });

    await expect(repo.deleteById(device.id, userB.id)).resolves.toBe(false);
    await expect(repo.deleteById(device.id, userA.id)).resolves.toBe(true);
    await expect(repo.getByApiKey("ka1")).resolves.toBeUndefined();
  });

  it("heartbeat sets lastSeen", async () => {
    const user = await createTestUser(db);
    const device = await repo.insert({ userId: user.id, name: "a1", apiKey: "ka1" });
    expect(device.lastSeen).toBeNull();

    await repo.heartbeat(device.id);

    const [updated] = await repo.listByUser(user.id);
    expect(updated.lastSeen).not.toBeNull();
  });

  it("updateLastAssigned sets lastAssignedAt", async () => {
    const user = await createTestUser(db);
    const device = await repo.insert({ userId: user.id, name: "a1", apiKey: "ka1" });
    expect(device.lastAssignedAt).toBeNull();

    await repo.updateLastAssigned(device.id);

    const [updated] = await repo.listByUser(user.id);
    expect(updated.lastAssignedAt).not.toBeNull();
  });

  it("ping resolves when the database is reachable", async () => {
    await expect(repo.ping()).resolves.toBeUndefined();
  });
});
