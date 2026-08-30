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

describe("POST /api/sms/send", () => {
  it("fails with 422 when the user has no devices", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/register").send({ username: "alice", password: "password123" });

    const res = await agent.post("/api/sms/send").send({ to: "+12125551234", body: "hi" });

    expect(res.status).toBe(422);
  });

  it("queues a message against the user's device", async () => {
    const { agent, deviceId } = await registerUserWithDevice("bob");

    const res = await agent.post("/api/sms/send").send({ to: "+12125551234", body: "hi" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "pending", deviceId });
  });

  it("rejects a non-E.164 recipient", async () => {
    const { agent } = await registerUserWithDevice("carol");
    const res = await agent.post("/api/sms/send").send({ to: "0001234", body: "hi" });
    expect(res.status).toBe(400);
  });

  it("404s when targeting a deviceId that isn't the user's", async () => {
    const { agent } = await registerUserWithDevice("dave");
    const res = await agent
      .post("/api/sms/send")
      .send({ to: "+12125550001", body: "hi", deviceId: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(404);
  });

  it("requires authentication", async () => {
    const res = await request(app).post("/api/sms/send").send({ to: "+12125550001", body: "hi" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/sms/:id", () => {
  it("returns a message scoped to the requesting user, 404 otherwise", async () => {
    const { agent } = await registerUserWithDevice("erin");
    const sent = await agent.post("/api/sms/send").send({ to: "+12125550001", body: "hi" });

    const found = await agent.get(`/api/sms/${sent.body.id}`);
    expect(found.status).toBe(200);

    const { agent: otherAgent } = await registerUserWithDevice("frank");
    const notFound = await otherAgent.get(`/api/sms/${sent.body.id}`);
    expect(notFound.status).toBe(404);
  });
});

describe("GET /api/sms/outbox", () => {
  it("filters by status", async () => {
    const { agent, apiKey } = await registerUserWithDevice("gina");
    await agent.post("/api/sms/send").send({ to: "+12125550001", body: "a" });
    await agent.post("/api/sms/send").send({ to: "+12125550002", body: "b" });
    const [first] = (await request(app).get("/device/sms/outbound").set("X-Api-Key", apiKey)).body;
    await request(app)
      .post("/device/sms/ack")
      .set("X-Api-Key", apiKey)
      .send([{ id: first.id, status: "sent" }]);

    const sentOnly = await agent.get("/api/sms/outbox").query({ status: "sent" });
    expect(sentOnly.body).toHaveLength(1);

    const all = await agent.get("/api/sms/outbox");
    expect(all.body).toHaveLength(2);
  });

  it("ignores an invalid status filter rather than erroring", async () => {
    const { agent } = await registerUserWithDevice("henry");
    await agent.post("/api/sms/send").send({ to: "+12125550001", body: "a" });

    const res = await agent.get("/api/sms/outbox").query({ status: "not-a-real-status" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/sms/:id/retry", () => {
  it("requeues a dead_letter message and 404s for anything else", async () => {
    const { agent, apiKey } = await registerUserWithDevice("iris");
    const sent = await agent.post("/api/sms/send").send({ to: "+12125550001", body: "a" });

    const notDead = await agent.post(`/api/sms/${sent.body.id}/retry`);
    expect(notDead.status).toBe(404);

    await request(app)
      .post("/device/sms/ack")
      .set("X-Api-Key", apiKey)
      .send([{ id: sent.body.id, status: "dead_letter", reason: "no signal" }]);

    const retried = await agent.post(`/api/sms/${sent.body.id}/retry`);
    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe("pending");
  });
});

describe("GET /api/stats", () => {
  it("aggregates totals across sent, pending, and received", async () => {
    const { agent, apiKey, deviceId } = await registerUserWithDevice("jack");
    await agent.post("/api/sms/send").send({ to: "+12125550001", body: "a" });
    await agent.post("/api/sms/send").send({ to: "+12125550002", body: "b" });
    const [msgA] = (await request(app).get("/device/sms/outbound").set("X-Api-Key", apiKey)).body;
    await request(app)
      .post("/device/sms/ack")
      .set("X-Api-Key", apiKey)
      .send([{ id: msgA.id, status: "sent" }]);
    await request(app)
      .post("/device/sms/received")
      .set("X-Api-Key", apiKey)
      .send([{ from: "+3", body: "incoming", receivedAt: Date.now() }]);

    const res = await agent.get("/api/stats");

    expect(res.body.totals).toMatchObject({ sent: 1, pending: 1, received: 1 });
    expect(res.body.devices).toHaveLength(1);
    expect(res.body.devices[0].id).toBe(deviceId);
  });
});

describe("settings", () => {
  it("returns defaults and reflects updates", async () => {
    const { agent } = await registerUserWithDevice("karen");

    const before = await agent.get("/api/settings");
    expect(before.body).toMatchObject({ routingStrategy: "least_load", healthCheckEnabled: true, apiKeySet: false });

    const update = await agent.put("/api/settings").send({ routingStrategy: "round_robin", healthCheckEnabled: false });
    expect(update.status).toBe(200);

    const after = await agent.get("/api/settings");
    expect(after.body).toMatchObject({ routingStrategy: "round_robin", healthCheckEnabled: false });
  });

  it("rejects an invalid routingStrategy", async () => {
    const { agent } = await registerUserWithDevice("liam");
    const res = await agent.put("/api/settings").send({ routingStrategy: "fastest" });
    expect(res.status).toBe(400);
  });

  it("generates a webhook secret and an api key", async () => {
    const { agent } = await registerUserWithDevice("mona");

    const secretRes = await agent.post("/api/settings/webhook-secret");
    expect(secretRes.status).toBe(200);
    expect(typeof secretRes.body.webhookSecret).toBe("string");

    const keyRes = await agent.post("/api/settings/api-key");
    expect(keyRes.status).toBe(200);
    expect(keyRes.body.apiKey).toMatch(/^pmk_/);

    const settings = await agent.get("/api/settings");
    expect(settings.body.apiKeySet).toBe(true);
  });

  it("accepts the generated api key as a Bearer token for user-authenticated routes", async () => {
    const { agent } = await registerUserWithDevice("noah");
    const keyRes = await agent.post("/api/settings/api-key");

    const res = await request(app)
      .get("/devices")
      .set("Authorization", `Bearer ${keyRes.body.apiKey}`);

    expect(res.status).toBe(200);
  });
});
