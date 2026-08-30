import { describe, expect, it, vi, beforeEach } from "vitest";
import { createOutboundService } from "../../src/services/outbound.service.js";

vi.mock("../../src/webhook.js", () => ({ fireWebhook: vi.fn() }));
import { fireWebhook } from "../../src/webhook.js";

function makeDevice(overrides: Partial<{
  id: string; userId: string; isPrimary: boolean; lastSeen: Date | null; lastAssignedAt: Date | null;
}> = {}) {
  return {
    id: overrides.id ?? "dev-1",
    userId: overrides.userId ?? "user-1",
    name: "device",
    apiKey: "key",
    isPrimary: overrides.isPrimary ?? false,
    lastSeen: overrides.lastSeen ?? null,
    lastAssignedAt: overrides.lastAssignedAt ?? null,
    createdAt: new Date(),
  };
}

function makeRepos() {
  const repo = {
    insert: vi.fn(),
    getPending: vi.fn(),
    countPendingByDevice: vi.fn().mockResolvedValue(new Map()),
    getRecentFailureRates: vi.fn().mockResolvedValue(new Map()),
    updateStatus: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    getStatsByUser: vi.fn(),
    requeueDeadLetter: vi.fn(),
  };
  const deviceRepo = {
    listByUser: vi.fn().mockResolvedValue([]),
    updateLastAssigned: vi.fn(),
    getByApiKey: vi.fn(),
    getPrimary: vi.fn(),
    insert: vi.fn(),
    deleteById: vi.fn(),
    setPrimary: vi.fn(),
    heartbeat: vi.fn(),
    ping: vi.fn(),
  };
  const userRepo = {
    findByUsername: vi.fn(),
    findById: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn(),
    findByApiKey: vi.fn(),
    setApiKey: vi.fn(),
    updateSettings: vi.fn(),
  };
  return { repo, deviceRepo, userRepo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("outbound.service selectDevice / queue", () => {
  it("throws NO_DEVICES when the user has no registered devices", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await expect(svc.queue("user-1", { to: "+1", body: "hi" } as any)).rejects.toMatchObject({ code: "NO_DEVICES" });
  });

  it("throws DEVICE_NOT_FOUND when an override deviceId isn't one of the user's devices", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    deviceRepo.listByUser.mockResolvedValue([makeDevice({ id: "dev-1" })]);
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await expect(
      svc.queue("user-1", { to: "+1", body: "hi", deviceId: "dev-does-not-exist" } as any),
    ).rejects.toMatchObject({ code: "DEVICE_NOT_FOUND" });
  });

  it("routes to the explicit deviceId override when valid, bypassing load balancing", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    deviceRepo.listByUser.mockResolvedValue([makeDevice({ id: "dev-1" }), makeDevice({ id: "dev-2" })]);
    repo.insert.mockResolvedValue({ id: "msg-1", deviceId: "dev-2" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.queue("user-1", { to: "+1", body: "hi", deviceId: "dev-2" } as any);

    expect(deviceRepo.updateLastAssigned).toHaveBeenCalledWith("dev-2");
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ deviceId: "dev-2" }));
  });

  it("falls back to the primary device when none are recently active", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    const primary = makeDevice({ id: "dev-primary", isPrimary: true, lastSeen: null });
    const other = makeDevice({ id: "dev-other", isPrimary: false, lastSeen: null });
    deviceRepo.listByUser.mockResolvedValue([other, primary]);
    repo.insert.mockResolvedValue({ id: "msg-1", deviceId: "dev-primary" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.queue("user-1", { to: "+1", body: "hi" } as any);

    expect(deviceRepo.updateLastAssigned).toHaveBeenCalledWith("dev-primary");
  });

  it("least_load strategy picks the active device with fewest pending messages", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    const recent = new Date();
    const busy = makeDevice({ id: "dev-busy", lastSeen: recent });
    const idle = makeDevice({ id: "dev-idle", lastSeen: recent });
    deviceRepo.listByUser.mockResolvedValue([busy, idle]);
    userRepo.findById.mockResolvedValue({ routingStrategy: "least_load", healthCheckEnabled: false });
    repo.countPendingByDevice.mockResolvedValue(new Map([["dev-busy", 5], ["dev-idle", 0]]));
    repo.insert.mockResolvedValue({ id: "msg-1", deviceId: "dev-idle" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.queue("user-1", { to: "+1", body: "hi" } as any);

    expect(deviceRepo.updateLastAssigned).toHaveBeenCalledWith("dev-idle");
  });

  it("round_robin strategy picks the active device assigned least recently", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    const recent = new Date();
    const assignedRecently = makeDevice({ id: "dev-recent", lastSeen: recent, lastAssignedAt: new Date() });
    const neverAssigned = makeDevice({ id: "dev-never", lastSeen: recent, lastAssignedAt: null });
    deviceRepo.listByUser.mockResolvedValue([assignedRecently, neverAssigned]);
    userRepo.findById.mockResolvedValue({ routingStrategy: "round_robin", healthCheckEnabled: false });
    repo.insert.mockResolvedValue({ id: "msg-1", deviceId: "dev-never" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.queue("user-1", { to: "+1", body: "hi" } as any);

    expect(deviceRepo.updateLastAssigned).toHaveBeenCalledWith("dev-never");
  });

  it("health checking excludes devices with a high recent failure rate", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    const recent = new Date();
    const flaky = makeDevice({ id: "dev-flaky", lastSeen: recent });
    const healthy = makeDevice({ id: "dev-healthy", lastSeen: recent });
    deviceRepo.listByUser.mockResolvedValue([flaky, healthy]);
    userRepo.findById.mockResolvedValue({ routingStrategy: "least_load", healthCheckEnabled: true });
    repo.getRecentFailureRates.mockResolvedValue(new Map([["dev-flaky", 0.9], ["dev-healthy", 0.1]]));
    repo.countPendingByDevice.mockResolvedValue(new Map());
    repo.insert.mockResolvedValue({ id: "msg-1", deviceId: "dev-healthy" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.queue("user-1", { to: "+1", body: "hi" } as any);

    expect(deviceRepo.updateLastAssigned).toHaveBeenCalledWith("dev-healthy");
  });
});

describe("outbound.service ackBatch", () => {
  it("fires a sms.sent webhook when a message with a webhookUrl transitions to sent", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    repo.updateStatus.mockResolvedValue({ id: "msg-1", recipient: "+1", webhookUrl: "https://example.com/hook" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.ackBatch([{ id: "msg-1", status: "sent", sentAt: Date.now() } as any], "dev-1");

    expect(fireWebhook).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({ event: "sms.sent" }),
    );
  });

  it("does not fire a webhook for in_progress acks", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    repo.updateStatus.mockResolvedValue({ id: "msg-1", recipient: "+1", webhookUrl: "https://example.com/hook" });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.ackBatch([{ id: "msg-1", status: "in_progress" } as any], "dev-1");

    expect(fireWebhook).not.toHaveBeenCalled();
  });

  it("does not fire a webhook when the message has no webhookUrl", async () => {
    const { repo, deviceRepo, userRepo } = makeRepos();
    repo.updateStatus.mockResolvedValue({ id: "msg-1", recipient: "+1", webhookUrl: null });
    const svc = createOutboundService(repo as any, deviceRepo as any, userRepo as any);

    await svc.ackBatch([{ id: "msg-1", status: "sent" } as any], "dev-1");

    expect(fireWebhook).not.toHaveBeenCalled();
  });
});
