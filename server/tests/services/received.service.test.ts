import { describe, expect, it, vi, beforeEach } from "vitest";
import { createReceivedService } from "../../src/services/received.service.js";

vi.mock("../../src/webhook.js", () => ({ fireWebhook: vi.fn() }));
import { fireWebhook } from "../../src/webhook.js";

function makeRepos() {
  const repo = {
    insert: vi.fn((data: any) => Promise.resolve({ id: "rx-1", ...data })),
    listByUser: vi.fn(),
    countReceivedByDevice: vi.fn(),
    markDelivered: vi.fn(),
  };
  const userRepo = {
    findByUsername: vi.fn(),
    findById: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(),
    findByApiKey: vi.fn(),
    setApiKey: vi.fn(),
    updateSettings: vi.fn(),
  };
  return { repo, userRepo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("received.service storeBatch", () => {
  it("stores every item against the given device", async () => {
    const { repo, userRepo } = makeRepos();
    const svc = createReceivedService(repo as any, userRepo as any);

    const items = [
      { from: "+1", body: "a", receivedAt: 1000 },
      { from: "+2", body: "b", receivedAt: 2000 },
    ];
    const rows = await svc.storeBatch(items as any, "dev-1", "user-1");

    expect(repo.insert).toHaveBeenCalledTimes(2);
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "dev-1", fromNumber: "+1" }));
    expect(rows).toHaveLength(2);
  });

  it("does not fire a webhook when the user has no webhookUrl configured", async () => {
    const { repo, userRepo } = makeRepos();
    userRepo.findById.mockResolvedValue({ webhookUrl: null, webhookSecret: null });
    const svc = createReceivedService(repo as any, userRepo as any);

    await svc.storeBatch([{ from: "+1", body: "a", receivedAt: 1000 }] as any, "dev-1", "user-1");

    expect(fireWebhook).not.toHaveBeenCalled();
    expect(repo.markDelivered).not.toHaveBeenCalled();
  });

  it("fires a signed webhook per message and marks it delivered when the user has a webhookUrl", async () => {
    const { repo, userRepo } = makeRepos();
    userRepo.findById.mockResolvedValue({ webhookUrl: "https://example.com/hook", webhookSecret: "s3cr3t" });
    const svc = createReceivedService(repo as any, userRepo as any);

    const rows = await svc.storeBatch(
      [{ from: "+1", body: "a", receivedAt: 1000 }, { from: "+2", body: "b", receivedAt: 2000 }] as any,
      "dev-1",
      "user-1",
    );

    expect(fireWebhook).toHaveBeenCalledTimes(2);
    expect(fireWebhook).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ event: "sms.received" }),
      "s3cr3t",
    );
    expect(repo.markDelivered).toHaveBeenCalledTimes(2);
    for (const row of rows) {
      expect(repo.markDelivered).toHaveBeenCalledWith(row.id);
    }
  });
});

describe("received.service listByUser", () => {
  it("delegates straight to the repo", async () => {
    const { repo, userRepo } = makeRepos();
    repo.listByUser.mockResolvedValue([{ id: "rx-1" }]);
    const svc = createReceivedService(repo as any, userRepo as any);

    const rows = await svc.listByUser("user-1", { page: 1, pageSize: 10 });

    expect(repo.listByUser).toHaveBeenCalledWith("user-1", { page: 1, pageSize: 10 });
    expect(rows).toEqual([{ id: "rx-1" }]);
  });
});
