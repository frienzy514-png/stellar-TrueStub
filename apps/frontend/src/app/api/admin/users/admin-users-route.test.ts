/** @jest-environment node */
import {
  PERMITTED_USER_FIELDS,
} from "@/lib/admin-users-api";
import { GET, POST, PATCH } from "@/app/api/admin/users/route";

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.signature`;
}

describe("API route /api/admin/users authorization & field sanitization (#499)", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("rejects unauthenticated requests with 401", async () => {
    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "GET",
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects non-admin tokens with 403", async () => {
    const buyerToken = makeJwt({
      uid: "buyer-1",
      role: "buyer",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "GET",
      headers: { Authorization: `Bearer ${buyerToken}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/administrator access is required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns only permitted user fields for authorized admins and strips sensitive fields", async () => {
    const adminToken = makeJwt({
      uid: "admin-1",
      "https://hasura.io/jwt/claims": { "x-hasura-role": "admin" },
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          users: [
            {
              id: "usr-real-001",
              first_name: "Nadia",
              last_name: "Solano",
              email: "nadia@truestub.io",
              phone_number: "+506 8888 1111",
              role: "seller",
              status: "active",
              kyc_verified: true,
              wallet_address:
                "GBCXK3ZQWFWMQJXLSIMVCAHUKTJVWRJPB5XYGZGQCVBWKWVEPTSYLUHI",
              escrows_count: 14,
              completed_volume: 4200,
              reputation_score: 4.9,
              total_reviews: 12,
              created_at: "2026-04-10T12:00:00Z",
              password_hash: "$2b$10$secret",
              reset_token: "secret-reset-token",
              mfa_recovery_codes: ["code-1"],
              deleted_at: null,
            },
          ],
        },
      }),
    });

    const req = new Request("http://localhost:3000/api/admin/users", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);

    const user = body.users[0] as Record<string, unknown>;
    for (const key of Object.keys(user)) {
      expect(PERMITTED_USER_FIELDS).toContain(key);
    }
    expect(user).not.toHaveProperty("password_hash");
    expect(user).not.toHaveProperty("reset_token");
    expect(user).not.toHaveProperty("mfa_recovery_codes");
    expect(user).not.toHaveProperty("deleted_at");
    expect(user.firstName).toBe("Nadia");
    expect(user.walletAddress).toBe("GBCX...LUHI");
  });

  it("persists user creation (POST) and role/status updates (PATCH) for authorized admins", async () => {
    const adminToken = makeJwt({
      uid: "admin-1",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            insert_users_one: {
              id: "usr-created-1",
              first_name: "Carlos",
              last_name: "Mora",
              email: "carlos@example.com",
              role: "moderator",
              status: "active",
              kyc_verified: true,
              wallet_address:
                "GDQP2LMKABCDEF1234567890MNOPQRSTUVWXYZ12345678904X9Z",
              created_at: "2026-05-01T00:00:00Z",
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            update_users_by_pk: {
              id: "usr-created-1",
              first_name: "Carlos",
              last_name: "Mora",
              email: "carlos@example.com",
              role: "admin",
              status: "suspended",
              kyc_verified: true,
              wallet_address:
                "GDQP2LMKABCDEF1234567890MNOPQRSTUVWXYZ12345678904X9Z",
              created_at: "2026-05-01T00:00:00Z",
            },
          },
        }),
      });

    const postReq = new Request("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        firstName: "Carlos",
        lastName: "Mora",
        email: "carlos@example.com",
        role: "moderator",
        kycVerified: true,
      }),
    });
    const postRes = await POST(postReq);
    expect(postRes.status).toBe(201);
    const postBody = await postRes.json();
    expect(postBody.user.id).toBe("usr-created-1");
    expect(postBody.user.role).toBe("moderator");

    const patchReq = new Request("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: "usr-created-1",
        role: "admin",
        status: "suspended",
      }),
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.user.role).toBe("admin");
    expect(patchBody.user.status).toBe("suspended");
  });
});
