import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/app.js";
import { truncateAll } from "../helpers/db.js";

const app = getTestApp();

beforeEach(async () => {
  await truncateAll();
});

async function registerAndLogin(username: string) {
  const agent = request.agent(app);
  await agent.post("/auth/register").send({ username, password: "password123" });
  return agent;
}

describe("devices controller", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/devices");
    expect(res.status).toBe(401);
  });

  it("registers the first device as primary and returns its api key once", async () => {
    const agent = await registerAndLogin("alice");

    const res = await agent.post("/devices").send({ name: "pixel" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "pixel", isPrimary: true });
    expect(typeof res.body.apiKey).toBe("string");
  });

  it("does not mark a second device primary", async () => {
    const agent = await registerAndLogin("bob");
    await agent.post("/devices").send({ name: "first" });

    const res = await agent.post("/devices").send({ name: "second" });

    expect(res.body.isPrimary).toBe(false);
  });

  it("rejects registration with an empty name", async () => {
    const agent = await registerAndLogin("carol");
    const res = await agent.post("/devices").send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("lists devices without exposing the api key", async () => {
    const agent = await registerAndLogin("dave");
    await agent.post("/devices").send({ name: "phone" });

    const res = await agent.get("/devices");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].apiKey).toBeUndefined();
  });

  it("does not list another user's devices", async () => {
    const agentA = await registerAndLogin("erin");
    await agentA.post("/devices").send({ name: "erin-phone" });
    const agentB = await registerAndLogin("frank");

    const res = await agentB.get("/devices");

    expect(res.body).toHaveLength(0);
  });

  it("setPrimary switches the primary device", async () => {
    const agent = await registerAndLogin("gina");
    await agent.post("/devices").send({ name: "first" });
    const second = await agent.post("/devices").send({ name: "second" });

    const res = await agent.post(`/devices/${second.body.id}/primary`);
    expect(res.status).toBe(200);

    const list = await agent.get("/devices");
    const primary = list.body.find((d: any) => d.isPrimary);
    expect(primary.id).toBe(second.body.id);
  });

  it("returns 404 setting primary on a nonexistent device", async () => {
    const agent = await registerAndLogin("henry");
    const res = await agent.post(`/devices/00000000-0000-0000-0000-000000000000/primary`);
    expect(res.status).toBe(404);
  });

  it("removes a device, and a second removal 404s", async () => {
    const agent = await registerAndLogin("iris");
    const created = await agent.post("/devices").send({ name: "phone" });

    const first = await agent.delete(`/devices/${created.body.id}`);
    expect(first.status).toBe(200);

    const second = await agent.delete(`/devices/${created.body.id}`);
    expect(second.status).toBe(404);
  });
});
