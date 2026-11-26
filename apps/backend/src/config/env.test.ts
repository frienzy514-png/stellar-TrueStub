import { validateEnv } from "./env";

// Firebase Admin credentials are required by the schema, so every fixture
// starts from these and layers the variables under test on top.
const REQUIRED = {
  FIREBASE_ADMIN_PROJECT_ID: "test-project",
  FIREBASE_ADMIN_CLIENT_EMAIL: "test@test-project.iam.gserviceaccount.com",
  FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
};

describe("Backend Environment Validation", () => {
  beforeEach(() => {
    // validateEnv logs the full error before throwing; keep test output clean.
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  it("should supply default values when optional vars are omitted", () => {
    const parsed = validateEnv({ ...REQUIRED });
    expect(parsed.PORT).toBe(4000);
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.TRUSTLESS_WORK_WEBHOOK_SECRET).toBeUndefined();
    expect(parsed.HASURA_GRAPHQL_URL).toBeUndefined();
    expect(parsed.HASURA_GRAPHQL_ADMIN_SECRET).toBeUndefined();
  });

  it("should parse valid custom PORT and NODE_ENV", () => {
    const parsed = validateEnv({
      ...REQUIRED,
      PORT: "5050",
      NODE_ENV: "production",
      CORS_ORIGINS: "https://app.truestub.example",
    });
    expect(parsed.PORT).toBe(5050);
    expect(parsed.NODE_ENV).toBe("production");
  });

  it("should parse valid roadmap variables when provided", () => {
    const parsed = validateEnv({
      ...REQUIRED,
      PORT: "4000",
      NODE_ENV: "test",
      TRUSTLESS_WORK_WEBHOOK_SECRET: "whsec_test123",
      HASURA_GRAPHQL_URL: "https://graphql.example.com/v1/graphql",
      HASURA_GRAPHQL_ADMIN_SECRET: "admin_secret_456",
    });
    expect(parsed.TRUSTLESS_WORK_WEBHOOK_SECRET).toBe("whsec_test123");
    expect(parsed.HASURA_GRAPHQL_URL).toBe("https://graphql.example.com/v1/graphql");
    expect(parsed.HASURA_GRAPHQL_ADMIN_SECRET).toBe("admin_secret_456");
  });

  it("should accept the legacy HASURA_ADMIN_SECRET name as an alias (#534)", () => {
    const parsed = validateEnv({ ...REQUIRED, HASURA_ADMIN_SECRET: "legacy_secret" });
    expect(parsed.HASURA_GRAPHQL_ADMIN_SECRET).toBe("legacy_secret");
  });

  it("should prefer HASURA_GRAPHQL_ADMIN_SECRET over the legacy alias when both are set", () => {
    const parsed = validateEnv({
      ...REQUIRED,
      HASURA_GRAPHQL_ADMIN_SECRET: "canonical_secret",
      HASURA_ADMIN_SECRET: "legacy_secret",
    });
    expect(parsed.HASURA_GRAPHQL_ADMIN_SECRET).toBe("canonical_secret");
  });

  it("should ignore an empty legacy HASURA_ADMIN_SECRET", () => {
    const parsed = validateEnv({ ...REQUIRED, HASURA_ADMIN_SECRET: "  " });
    expect(parsed.HASURA_GRAPHQL_ADMIN_SECRET).toBeUndefined();
  });

  it("should throw when a required Firebase Admin variable is missing", () => {
    expect(() => validateEnv({})).toThrow(/FIREBASE_ADMIN_PROJECT_ID/);
  });

  it("should throw a descriptive error on non-numeric PORT", () => {
    expect(() => validateEnv({ ...REQUIRED, PORT: "not-a-number" })).toThrow(
      /Invalid environment variables[\s\S]*PORT/,
    );
  });

  it("should throw on out-of-range PORT", () => {
    expect(() => validateEnv({ ...REQUIRED, PORT: "70000" })).toThrow(/PORT/);
    expect(() => validateEnv({ ...REQUIRED, PORT: "0" })).toThrow(/PORT/);
  });

  it("should throw on invalid NODE_ENV", () => {
    expect(() => validateEnv({ ...REQUIRED, NODE_ENV: "invalid_env" as any })).toThrow(/NODE_ENV/);
  });

  it("should accept a valid TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS list (#532)", () => {
    const parsed = validateEnv({
      ...REQUIRED,
      TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS: "203.0.113.10, 198.51.100.0/24",
    });
    expect(parsed.TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS).toBe("203.0.113.10, 198.51.100.0/24");
  });

  it("should fail fast on a malformed TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS entry", () => {
    expect(() =>
      validateEnv({ ...REQUIRED, TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS: "203.0.113.10, nope" }),
    ).toThrow(/TRUSTLESS_WORK_WEBHOOK_ALLOWED_IPS/);
  });

  it("should throw on invalid HASURA_GRAPHQL_URL URL format", () => {
    expect(() => validateEnv({ ...REQUIRED, HASURA_GRAPHQL_URL: "not-a-valid-url" })).toThrow(
      /HASURA_GRAPHQL_URL/,
    );
  });

  // Regression for the Zod 4 validation path: reading the removed `.errors`
  // property threw a TypeError that replaced the real diagnostics, so an
  // operator with several bad variables only saw
  // "Cannot read properties of undefined (reading 'map')" and had to fix
  // them one boot at a time.
  it("reports every invalid variable in one formatted message", () => {
    let message = "";
    try {
      validateEnv({
        ...REQUIRED,
        PORT: "not-a-number",
        HASURA_GRAPHQL_URL: "not-a-valid-url",
        SENTRY_DSN: "also-not-a-url",
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toMatch(/Invalid environment variables/);
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/HASURA_GRAPHQL_URL/);
    expect(message).toMatch(/SENTRY_DSN/);
    expect(message).not.toMatch(/Cannot read properties of undefined/);
  });

  // #526 — these two were previously read straight from process.env, so the
  // index.ts reference to a non-schema key was always undefined and a bad
  // threshold silently disabled the low-balance alert.
  describe("dispute-resolver balance monitor variables (#420/#526)", () => {
    const VALID_ADDRESS = `G${"A".repeat(55)}`;

    it("accepts a Stellar address and coerces the threshold to a number", () => {
      const parsed = validateEnv({
        ...REQUIRED,
        DISPUTE_RESOLVER_WALLET_ADDRESS: VALID_ADDRESS,
        DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD: "25",
      });
      expect(parsed.DISPUTE_RESOLVER_WALLET_ADDRESS).toBe(VALID_ADDRESS);
      expect(parsed.DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD).toBe(25);
    });

    it("leaves both unset when omitted, so the monitor stays disabled", () => {
      const parsed = validateEnv({ ...REQUIRED });
      expect(parsed.DISPUTE_RESOLVER_WALLET_ADDRESS).toBeUndefined();
      expect(parsed.DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD).toBeUndefined();
    });

    it("rejects an address that is not a Stellar account id", () => {
      expect(() =>
        validateEnv({ ...REQUIRED, DISPUTE_RESOLVER_WALLET_ADDRESS: "not-a-stellar-address" }),
      ).toThrow(/DISPUTE_RESOLVER_WALLET_ADDRESS/);
    });

    it("rejects a non-numeric or negative threshold instead of ignoring it", () => {
      expect(() =>
        validateEnv({ ...REQUIRED, DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD: "not-a-number" }),
      ).toThrow(/DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD/);
      expect(() =>
        validateEnv({ ...REQUIRED, DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD: "-1" }),
      ).toThrow(/DISPUTE_RESOLVER_LOW_BALANCE_THRESHOLD/);
    });
  });

  describe("CORS_ORIGINS in production (#558)", () => {
    it("refuses to boot in production when CORS_ORIGINS is unset", () => {
      expect(() => validateEnv({ ...REQUIRED, NODE_ENV: "production" })).toThrow(/CORS_ORIGINS/);
    });

    it("refuses to boot in production when CORS_ORIGINS is blank", () => {
      expect(() => validateEnv({ ...REQUIRED, NODE_ENV: "production", CORS_ORIGINS: "   " })).toThrow(
        /CORS_ORIGINS/,
      );
    });

    it("boots in production when CORS_ORIGINS is set explicitly", () => {
      const parsed = validateEnv({
        ...REQUIRED,
        NODE_ENV: "production",
        CORS_ORIGINS: "https://app.truestub.example",
      });
      expect(parsed.CORS_ORIGINS).toBe("https://app.truestub.example");
    });

    it("keeps the localhost default outside production", () => {
      const parsed = validateEnv({ ...REQUIRED, NODE_ENV: "development" });
      expect(parsed.CORS_ORIGINS).toBe("http://localhost:3000");
    });
  });
});
