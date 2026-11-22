/**
 * Audit: can a regular user influence the role claim `requireAdmin` reads? (#530)
 *
 * `requireAdmin` reads `role` / `https://hasura.io/jwt/claims["x-hasura-role"]`
 * only from the token returned by `firebaseAuth.verifyIdToken`, i.e. claims
 * covered by the Firebase signature. Those custom claims can only be written
 * with the Admin SDK's `setCustomUserClaims`. This file checks both halves:
 *   1. Nothing the client sends outside the verified token (body, query,
 *      headers) is considered when deciding admin access.
 *   2. No backend source file calls `setCustomUserClaims`, so no reachable
 *      endpoint can grant a user the admin claim. Adding such a call must be a
 *      deliberate, reviewed change that also updates the allow-list below.
 */
import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";

const verifyIdToken = jest.fn();
jest.mock("../lib/firebase-admin", () => ({
  firebaseAuth: { verifyIdToken: (token: string) => verifyIdToken(token) },
}));

import { requireAdmin } from "./auth";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/admin", requireAdmin, (_req, res) => res.json({ ok: true }));
  return app;
}

const REGULAR_USER = { uid: "user-1", email: "user@example.com" };

beforeEach(() => verifyIdToken.mockReset());

describe("requireAdmin only trusts verified token claims", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(buildApp()).get("/admin");
    expect(res.status).toBe(401);
  });

  it("rejects a regular user with 403", async () => {
    verifyIdToken.mockResolvedValue(REGULAR_USER);
    const res = await request(buildApp()).get("/admin").set("Authorization", "Bearer user");
    expect(res.status).toBe(403);
  });

  it("ignores a role supplied in the request body", async () => {
    verifyIdToken.mockResolvedValue(REGULAR_USER);
    const res = await request(buildApp())
      .post("/admin")
      .set("Authorization", "Bearer user")
      .send({
        role: "admin",
        "https://hasura.io/jwt/claims": { "x-hasura-role": "admin" },
        user: { role: "admin" },
      });
    expect(res.status).toBe(403);
  });

  it("ignores a role supplied in the query string", async () => {
    verifyIdToken.mockResolvedValue(REGULAR_USER);
    const res = await request(buildApp())
      .get("/admin?role=admin&x-hasura-role=admin")
      .set("Authorization", "Bearer user");
    expect(res.status).toBe(403);
  });

  it("ignores role-like request headers", async () => {
    verifyIdToken.mockResolvedValue(REGULAR_USER);
    const res = await request(buildApp())
      .get("/admin")
      .set("Authorization", "Bearer user")
      .set("x-hasura-role", "admin")
      .set("x-role", "admin")
      .set("role", "admin");
    expect(res.status).toBe(403);
  });

  it("rejects a non-admin top-level role even if the Hasura claim says admin", async () => {
    // `role` takes precedence; a lower-privilege role claim is never upgraded.
    verifyIdToken.mockResolvedValue({
      ...REGULAR_USER,
      role: "user",
      "https://hasura.io/jwt/claims": { "x-hasura-role": "admin" },
    });
    const res = await request(buildApp()).get("/admin").set("Authorization", "Bearer user");
    expect(res.status).toBe(403);
  });

  it.each([["ADMIN"], ["Admin"], [["admin"]], [{ role: "admin" }], [true]])(
    "rejects a role claim that is not exactly the string \"admin\" (%p)",
    async (role) => {
      verifyIdToken.mockResolvedValue({ ...REGULAR_USER, role });
      const res = await request(buildApp()).get("/admin").set("Authorization", "Bearer user");
      expect(res.status).toBe(403);
    }
  );

  it("passes only the bearer token to verifyIdToken", async () => {
    verifyIdToken.mockResolvedValue({ ...REGULAR_USER, role: "admin" });
    const res = await request(buildApp())
      .post("/admin")
      .set("Authorization", "Bearer signed-token")
      .send({ role: "admin" });
    expect(res.status).toBe(200);
    expect(verifyIdToken).toHaveBeenCalledTimes(1);
    expect(verifyIdToken).toHaveBeenCalledWith("signed-token");
  });

  it.each([
    [{ role: "admin" }],
    [{ "https://hasura.io/jwt/claims": { "x-hasura-role": "admin" } }],
  ])("allows a verified token carrying the server-issued admin claim (%p)", async (claims) => {
    verifyIdToken.mockResolvedValue({ ...REGULAR_USER, ...claims });
    const res = await request(buildApp()).get("/admin").set("Authorization", "Bearer admin");
    expect(res.status).toBe(200);
  });
});

describe("no backend code path can set custom claims", () => {
  const SRC_DIR = path.resolve(__dirname, "..");

  // Files allowed to call `setCustomUserClaims`. Empty today: admin claims are
  // granted out-of-band by an operator with Admin SDK credentials, never by an
  // HTTP endpoint. If one is ever added it must be admin-gated and listed here.
  const ALLOWED_CLAIM_WRITERS: string[] = [];

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (/\.ts$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name)) return [full];
      return [];
    });
  }

  it("only allow-listed files call setCustomUserClaims", () => {
    const writers = sourceFiles(SRC_DIR)
      .filter((file) => /setCustomUserClaims/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC_DIR, file).split(path.sep).join("/"));

    expect(writers).toEqual(ALLOWED_CLAIM_WRITERS);
  });
});
