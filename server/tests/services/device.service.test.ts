import { describe, expect, it, vi, beforeEach } from "vitest";
import { createDeviceService } from "../../src/services/device.service.js";

function makeRepo() {
  return {
    getByApiKey: vi.fn(),
    listByUser: vi.fn(),
    getPrimary: vi.fn(),
    insert: vi.fn(),
    deleteById: vi.fn(),
    setPrimary: vi.fn(),
    heartbeat: vi.fn(),
    updateLastAssigned: vi.fn(),
    ping: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("device.service", () => {
  it("heartbeat delegates to the repo", async () => {
    const repo = makeRepo();
    const svc = createDeviceService(repo as any);

    await svc.heartbeat("dev-1");

    expect(repo.heartbeat).toHaveBeenCalledWith("dev-1");
  });

  it("health reports db: true when ping succeeds", async () => {
    const repo = makeRepo();
    repo.ping.mockResolvedValue(undefined);
    const svc = createDeviceService(repo as any);

    await expect(svc.health()).resolves.toEqual({ db: true });
  });

  it("health reports db: false when ping throws", async () => {
    const repo = makeRepo();
    repo.ping.mockRejectedValue(new Error("connection refused"));
    const svc = createDeviceService(repo as any);

    await expect(svc.health()).resolves.toEqual({ db: false });
  });
});
