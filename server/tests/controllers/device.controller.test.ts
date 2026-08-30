import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/app.js";
import { truncateAll } from "../helpers/db.js";

const app = getTestApp();

beforeEach(async () => {
  await truncateAll();
});

async function registerUserWithDevice(username: string) {
  const agent = request.agent(app);
  await agent.post("/auth/register").send({ username, password: "password123" });
  const deviceRes = await agent.post("/devices").send({ name: "phone" });
  return { agent, apiKey: deviceRes.body.apiKey as string, deviceId: deviceRes.body.id as string };
}

describe("device controller (device-key auth)", () => {
  it("rejects requests with no api key", async () => {
    const res = await request(app).get("/device/ping");
    expect(res.status).toBe(401);
  });

  it("rejects requests with an unknown api key", async () => {
    const res = await request(app).get("/device/ping").set("X-Api-Key", "bogus");
    expect(res.status).toBe(401);
  });

  it("ping identifies the device", async () => {
    const { apiKey, deviceId } = await registerUserWithDevice("alice");

    const res = await request(app).get("/device/ping").set("X-Api-Key", apiKey);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, deviceId, deviceName: "phone" });
  });

  it("getOutbound is empty until a message is queued for the device", async () => {
    const { agent, apiKey } = await registerUserWithDevice("bob");

    const before = await request(app).get("/device/sms/outbound").set("X-Api-Key", apiKey);
    expect(before.body).toEqual([]);

    await agent.post("/api/sms/send").send({ to: "+12125551234", body: "hi" });

    const after = await request(app).get("/device/sms/outbound").set("X-Api-Key", apiKey);
    expect(after.body).toHaveLength(1);
    expect(after.body[0]).toMatchObject({ to: "+12125551234", body: "hi" });
  });

  it("ack transitions a message to sent and it shows up in outbox stats", async () => {
    const { agent, apiKey } = await registerUserWithDevice("carol");
    await agent.post("/api/sms/send").send({ to: "+12125550001", body: "hi" });
    const [queued] = (await request(app).get("/device/sms/outbound").set("X-Api-Key", apiKey)).body;

    const ackRes = await request(app)
      .post("/device/sms/ack")
      .set("X-Api-Key", apiKey)
      .send([{ id: queued.id, status: "sent", sentAt: Date.now() }]);

    expect(ackRes.status).toBe(200);
    const stats = await agent.get("/api/stats");
    expect(stats.body.totals.sent).toBe(1);
  });

  it("ack cannot be spoofed for a message belonging to a different device", async () => {
    const { agent, apiKey: keyA } = await registerUserWithDevice("dave");
    const { apiKey: keyB } = await registerUserWithDevice("erin");
    await agent.post("/api/sms/send").send({ to: "+12125550001", body: "hi" });
    const [queued] = (await request(app).get("/device/sms/outbound").set("X-Api-Key", keyA)).body;

    await request(app)
      .post("/device/sms/ack")
      .set("X-Api-Key", keyB)
      .send([{ id: queued.id, status: "sent" }]);

    const stats = await agent.get("/api/stats");
    expect(stats.body.totals.sent).toBe(0); // ack from wrong device did not apply
  });

  it("rejects an ack batch that fails validation", async () => {
    const { apiKey } = await registerUserWithDevice("frank");
    const res = await request(app).post("/device/sms/ack").set("X-Api-Key", apiKey).send([{ id: "not-a-uuid" }]);
    expect(res.status).toBe(400);
  });

  it("receiveSms stores messages and they appear in the owning user's inbox", async () => {
    const { agent, apiKey } = await registerUserWithDevice("gina");

    const res = await request(app)
      .post("/device/sms/received")
      .set("X-Api-Key", apiKey)
      .send([{ from: "+15550001111", body: "incoming", receivedAt: Date.now() }]);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ stored: 1 });

    const inbox = await agent.get("/api/sms/inbox");
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ fromNumber: "+15550001111", body: "incoming" });
  });
});
