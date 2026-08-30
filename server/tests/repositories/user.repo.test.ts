import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb, truncateAll } from "../helpers/db.js";
import { createUserRepo } from "../../src/repositories/user.repo.js";

const db = getTestDb();
const repo = createUserRepo(db);

beforeEach(async () => {
  await truncateAll(db);
});

describe("user.repo", () => {
  it("inserts a user and finds it by username and id", async () => {
    const user = await repo.insert({ username: "alice", passwordHash: "hash" });

    await expect(repo.findByUsername("alice")).resolves.toMatchObject({ id: user.id });
    await expect(repo.findById(user.id)).resolves.toMatchObject({ username: "alice" });
    await expect(repo.findByUsername("nobody")).resolves.toBeUndefined();
  });

  it("finds a user by api key once set, not before", async () => {
    const user = await repo.insert({ username: "bob", passwordHash: "hash" });
    await expect(repo.findByApiKey("pmk_abc")).resolves.toBeUndefined();

    await repo.setApiKey(user.id, "pmk_abc");

    await expect(repo.findByApiKey("pmk_abc")).resolves.toMatchObject({ id: user.id });
  });

  it("updateSettings only touches the provided fields", async () => {
    const user = await repo.insert({ username: "carol", passwordHash: "hash" });

    await repo.updateSettings(user.id, { routingStrategy: "round_robin" });
    let updated = await repo.findById(user.id);
    expect(updated?.routingStrategy).toBe("round_robin");
    expect(updated?.healthCheckEnabled).toBe(true); // untouched default

    await repo.updateSettings(user.id, { webhookUrl: "https://example.com/hook" });
    updated = await repo.findById(user.id);
    expect(updated?.webhookUrl).toBe("https://example.com/hook");
    expect(updated?.routingStrategy).toBe("round_robin"); // still set from before
  });

  it("defaults new users to least_load routing with health checks enabled", async () => {
    const user = await repo.insert({ username: "dave", passwordHash: "hash" });
    expect(user.routingStrategy).toBe("least_load");
    expect(user.healthCheckEnabled).toBe(true);
    expect(user.apiKey).toBeNull();
  });
});
