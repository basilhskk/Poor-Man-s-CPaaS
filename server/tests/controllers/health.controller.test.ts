import { describe, expect, it } from "vitest";
import request from "supertest";
import { getTestApp } from "../helpers/app.js";

const app = getTestApp();

describe("GET /health", () => {
  it("reports the database as reachable", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ db: true });
  });
});
