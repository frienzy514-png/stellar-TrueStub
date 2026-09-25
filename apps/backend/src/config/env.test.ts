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
    const parsed = validateEnv({ ...REQUIRED, PORT: "5050", NODE_ENV: "production" });
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

  it("should throw on invalid HASURA_GRAPHQL_URL URL format", () => {
    expect(() => validateEnv({ ...REQUIRED, HASURA_GRAPHQL_URL: "not-a-valid-url" })).toThrow(
      /HASURA_GRAPHQL_URL/,
    );
  });
});
