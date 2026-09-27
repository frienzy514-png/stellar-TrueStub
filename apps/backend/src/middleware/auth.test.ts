import express from "express";
import request from "supertest";

const verifyIdToken = jest.fn();
jest.mock("../lib/firebase-admin", () => ({
  firebaseAuth: { verifyIdToken: (token: string) => verifyIdToken(token) },
}));

import { requireAuth, requireAuthForWrites } from "./auth";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/protected", requireAuth, (_req, res) => res.json({ user: res.locals.user }));
  app.use("/writes", requireAuthForWrites, (_req, res) => res.json({ ok: true }));
  return app;
}

describe("requireAuth", () => {
  beforeEach(() => verifyIdToken.mockReset());

  it("rejects requests without an Authorization header with 401", async () => {
    const res = await request(buildApp()).post("/protected").send({});
    expect(res.status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("rejects requests with an invalid token with 401", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    const res = await request(buildApp()).post("/protected").set("Authorization", "Bearer bad");
    expect(res.status).toBe(401);
  });

  it("allows requests with a valid token", async () => {
    verifyIdToken.mockResolvedValue({ uid: "user-1" });
    const res = await request(buildApp()).post("/protected").set("Authorization", "Bearer good");
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ uid: "user-1" });
  });
});

describe("requireAuthForWrites", () => {
  beforeEach(() => verifyIdToken.mockReset());

  it("lets unauthenticated reads through", async () => {
    const res = await request(buildApp()).get("/writes");
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated writes with 401", async () => {
    const res = await request(buildApp()).post("/writes").send({});
    expect(res.status).toBe(401);
  });
});
