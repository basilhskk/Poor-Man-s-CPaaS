import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/app.js";
import { truncateAll } from "../helpers/db.js";

const app = getTestApp();

beforeEach(async () => {
  await truncateAll();
});

describe("POST /auth/register", () => {
  it("creates a user and sets a session cookie", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: "alice" });
    expect(res.headers["set-cookie"]?.[0]).toMatch(/token=/);
  });

  it("rejects a duplicate username", async () => {
    await request(app).post("/auth/register").send({ username: "alice", password: "password123" });
    const res = await request(app).post("/auth/register").send({ username: "alice", password: "password123" });

    expect(res.status).toBe(409);
  });

  it("rejects an invalid body", async () => {
    const res = await request(app).post("/auth/register").send({ username: "a", password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    await request(app).post("/auth/register").send({ username: "bob", password: "password123" });

    const res = await request(app).post("/auth/login").send({ username: "bob", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/token=/);
  });

  it("rejects an unknown username", async () => {
    const res = await request(app).post("/auth/login").send({ username: "nobody", password: "password123" });
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    await request(app).post("/auth/register").send({ username: "carol", password: "password123" });
    const res = await request(app).post("/auth/login").send({ username: "carol", password: "wrongpass" });
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user when authenticated", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/register").send({ username: "dave", password: "password123" });

    const res = await agent.get("/auth/me");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "dave" });
  });
});

describe("POST /auth/logout", () => {
  it("clears the session cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/auth/register").send({ username: "erin", password: "password123" });

    await agent.post("/auth/logout");
    const res = await agent.get("/auth/me");

    expect(res.status).toBe(401);
  });
});
