import { describe, expect, it, vi, beforeEach } from "vitest";

const resolve4 = vi.fn();
const resolve6 = vi.fn();
vi.mock("dns/promises", () => ({ resolve4: (...args: any[]) => resolve4(...args), resolve6: (...args: any[]) => resolve6(...args) }));

import { isSafeWebhookUrl } from "../../src/utils/url.js";

beforeEach(() => {
  resolve4.mockReset();
  resolve6.mockReset();
});

describe("isSafeWebhookUrl", () => {
  it("rejects an unparseable URL", async () => {
    await expect(isSafeWebhookUrl("not a url")).resolves.toBe(false);
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(isSafeWebhookUrl("ftp://example.com")).resolves.toBe(false);
  });

  it("rejects a literal private IPv4 address", async () => {
    await expect(isSafeWebhookUrl("http://127.0.0.1/hook")).resolves.toBe(false);
    await expect(isSafeWebhookUrl("http://10.0.0.5/hook")).resolves.toBe(false);
    await expect(isSafeWebhookUrl("http://192.168.1.1/hook")).resolves.toBe(false);
    await expect(isSafeWebhookUrl("http://172.16.0.1/hook")).resolves.toBe(false);
  });

  it("accepts a literal public IPv4 address", async () => {
    await expect(isSafeWebhookUrl("http://8.8.8.8/hook")).resolves.toBe(true);
  });

  it("rejects a hostname that resolves to a private address", async () => {
    resolve4.mockResolvedValue(["127.0.0.1"]);
    resolve6.mockRejectedValue(new Error("no AAAA"));
    await expect(isSafeWebhookUrl("https://internal.example.com/hook")).resolves.toBe(false);
  });

  it("accepts a hostname that resolves only to public addresses", async () => {
    resolve4.mockResolvedValue(["93.184.216.34"]);
    resolve6.mockRejectedValue(new Error("no AAAA"));
    await expect(isSafeWebhookUrl("https://public.example.com/hook")).resolves.toBe(true);
  });

  it("rejects when DNS resolution fails entirely", async () => {
    resolve4.mockRejectedValue(new Error("NXDOMAIN"));
    resolve6.mockRejectedValue(new Error("NXDOMAIN"));
    await expect(isSafeWebhookUrl("https://nowhere.invalid/hook")).resolves.toBe(false);
  });
});
