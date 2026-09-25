/**
 * Integration tests for the Firebase → Hasura JWT auth boundary.
 *
 * The security model documented in `apps/frontend/README.md` hinges on the
 * frontend authenticating to Hasura via a Firebase-issued JWT (see
 * `src/config/apollo.ts`'s `authLink`, which attaches
 * `Authorization: Bearer <token>`), and Hasura trusting/mapping claims from
 * that JWT rather than using the admin secret.
 *
 * These tests exercise that boundary at the mocked seam:
 *  1. The frontend `authLink` correctly attaches the Firebase JWT.
 *  2. A simulated Hasura JWT validator (the boundary) enforces:
 *     - valid token → expected role/permissions,
 *     - expired token → rejected,
 *     - cross-user isolation → a token for one user cannot read another's data.
 */
import { createHmac } from "crypto";

import { buildAuthHeaders } from "./apollo";

// ---------------------------------------------------------------------------
// Mock the Firebase client so we can control the signed-in user and the token
// it would hand to the authLink.
// ---------------------------------------------------------------------------
const mockGetIdToken = jest.fn();
let mockCurrentUser: { getIdToken: jest.Mock } | null = { getIdToken: mockGetIdToken };

jest.mock("@/lib/firebase", () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

// ---------------------------------------------------------------------------
// Minimal JWT helpers (HMAC-SHA256) so we can mint realistic Firebase-style
// tokens for the boundary tests without pulling in a JWT library.
// ---------------------------------------------------------------------------
const JWT_SECRET = "test-hasura-jwt-secret";

function base64UrlEncode(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

interface FirebaseClaims {
  sub: string;
  email?: string;
  name?: string;
  iat: number;
  exp: number;
  aud: string;
  iss: string;
  "https://hasura.io/jwt/claims"?: {
    "x-hasura-default-role": string;
    "x-hasura-allowed-roles": string[];
    "x-hasura-user-id": string;
  };
}

function signJwt(header: string, payload: string): string {
  const data = `${header}.${payload}`;
  const signature = createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
  return `${data}.${signature}`;
}

function createFirebaseJwt(claims: Partial<FirebaseClaims>): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: "user-1",
      email: "user1@example.com",
      iat: now,
      exp: now + 3600,
      aud: "truestub-test",
      iss: "https://securetoken.google.com/truestub-test",
      "https://hasura.io/jwt/claims": {
        "x-hasura-default-role": "user",
        "x-hasura-allowed-roles": ["user"],
        "x-hasura-user-id": "user-1",
      },
      ...claims,
    }),
  );
  return signJwt(header, payload);
}

// ---------------------------------------------------------------------------
// Simulated Hasura JWT boundary.
//
// This mirrors what Hasura does when it receives `Authorization: Bearer <jwt>`:
// it verifies the token (signature + expiry), maps the Firebase custom claims
// into Hasura session variables (role + user id), and then enforces row-level
// permissions so a user can only read their own rows.
// ---------------------------------------------------------------------------
type HasuraSession = {
  role: string;
  userId: string;
};

function verifyAndMapClaims(token: string): HasuraSession {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    throw new Error("Malformed JWT");
  }

  const expectedSignature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  if (signature !== expectedSignature) {
    throw new Error("Invalid JWT signature");
  }

  const claims = JSON.parse(base64UrlDecode(payload)) as FirebaseClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) {
    throw new Error("Token expired");
  }

  const hasuraClaims = claims["https://hasura.io/jwt/claims"];
  if (!hasuraClaims) {
    throw new Error("Missing Hasura claims mapping");
  }

  return {
    role: hasuraClaims["x-hasura-default-role"],
    userId: hasuraClaims["x-hasura-user-id"],
  };
}

// Simulated Hasura row-level permission: a user may only read rows owned by
// themselves (cross-user isolation).
function canReadRow(session: HasuraSession, rowOwnerId: string): boolean {
  return session.userId === rowOwnerId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Firebase → Hasura JWT auth boundary", () => {
  beforeEach(() => {
    mockGetIdToken.mockReset();
    mockCurrentUser = { getIdToken: mockGetIdToken };
  });

  describe("frontend authLink (src/config/apollo.ts)", () => {
    it("attaches the Firebase JWT as `Authorization: Bearer <token>`", async () => {
      mockGetIdToken.mockResolvedValue("firebase-jwt-abc123");

      const headers = await buildAuthHeaders({ "content-type": "application/json" });

      expect(headers).toEqual({
        "content-type": "application/json",
        Authorization: "Bearer firebase-jwt-abc123",
      });
      expect(mockGetIdToken).toHaveBeenCalledTimes(1);
    });

    it("omits the Authorization header when no user is signed in", async () => {
      mockCurrentUser = null;

      const headers = await buildAuthHeaders({ "content-type": "application/json" });

      expect(headers).toEqual({ "content-type": "application/json" });
      expect(mockGetIdToken).not.toHaveBeenCalled();
    });
  });

  describe("Hasura JWT boundary (valid / expired / cross-user)", () => {
    it("maps a valid token to the expected role and permissions", () => {
      const token = createFirebaseJwt({});

      const session = verifyAndMapClaims(token);

      expect(session).toEqual({ role: "user", userId: "user-1" });
      // The user can read their own rows.
      expect(canReadRow(session, "user-1")).toBe(true);
    });

    it("rejects an expired token", () => {
      const token = createFirebaseJwt({ exp: Math.floor(Date.now() / 1000) - 60 });

      expect(() => verifyAndMapClaims(token)).toThrow("Token expired");
    });

    it("rejects a token with a tampered signature", () => {
      const token = createFirebaseJwt({});
      const tampered = `${token.slice(0, -1)}x`;

      expect(() => verifyAndMapClaims(token)).not.toThrow();
      expect(() => verifyAndMapClaims(tampered)).toThrow("Invalid JWT signature");
    });

    it("enforces cross-user isolation: a token for one user cannot read another user's data", () => {
      const userOneToken = createFirebaseJwt({ sub: "user-1" });
      const userTwoToken = createFirebaseJwt({
        sub: "user-2",
        email: "user2@example.com",
        "https://hasura.io/jwt/claims": {
          "x-hasura-default-role": "user",
          "x-hasura-allowed-roles": ["user"],
          "x-hasura-user-id": "user-2",
        },
      });

      const userOneSession = verifyAndMapClaims(userOneToken);
      const userTwoSession = verifyAndMapClaims(userTwoToken);

      // Each user can read their own rows…
      expect(canReadRow(userOneSession, "user-1")).toBe(true);
      expect(canReadRow(userTwoSession, "user-2")).toBe(true);

      // …but neither can read the other's rows.
      expect(canReadRow(userOneSession, "user-2")).toBe(false);
      expect(canReadRow(userTwoSession, "user-1")).toBe(false);
    });

    it("rejects a token that lacks the Hasura claims mapping", () => {
      const token = createFirebaseJwt({ "https://hasura.io/jwt/claims": undefined });

      expect(() => verifyAndMapClaims(token)).toThrow("Missing Hasura claims mapping");
    });
  });
});
