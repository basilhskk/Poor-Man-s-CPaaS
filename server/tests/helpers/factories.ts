import { randomUUID } from "crypto";
import type { Db } from "../../src/db/client.js";
import { createUserRepo, type UserRow } from "../../src/repositories/user.repo.js";
import { createDeviceRepo, type DeviceRow } from "../../src/repositories/device.repo.js";

export async function createTestUser(
  db: Db,
  overrides: Partial<{ username: string; passwordHash: string }> = {},
): Promise<UserRow> {
  const repo = createUserRepo(db);
  return repo.insert({
    username: overrides.username ?? `user_${randomUUID().slice(0, 8)}`,
    passwordHash: overrides.passwordHash ?? "hash",
  });
}

export async function createTestDevice(
  db: Db,
  userId: string,
  overrides: Partial<{ name: string; apiKey: string }> = {},
): Promise<DeviceRow> {
  const repo = createDeviceRepo(db);
  return repo.insert({
    userId,
    name: overrides.name ?? `device_${randomUUID().slice(0, 8)}`,
    apiKey: overrides.apiKey ?? `key_${randomUUID()}`,
  });
}
