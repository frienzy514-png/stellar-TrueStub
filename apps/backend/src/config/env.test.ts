import { validateEnv, envSchema } from "./env";

describe("Backend Environment Validation", () => {
  it("should supply default values when optional vars are omitted", () => {
    const parsed = validateEnv({});
    expect(parsed.PORT).toBe(4000);
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.TRUSTLESS_WORK_WEBHOOK_SECRET).toBeUndefined();
    expect(parsed.HASURA_GRAPHQL_URL).toBeUndefined();
    expect(parsed.HASURA_GRAPHQL_ADMIN_SECRET).toBeUndefined();
  });

  it("should parse valid custom PORT and NODE_ENV", () => {
    const parsed = validateEnv({
      PORT: "5050",
      NODE_ENV: "production",
    });
    expect(parsed.PORT).toBe(5050);
    expect(parsed.NODE_ENV).toBe("production");
  });

  it("should parse valid roadmap variables when provided", () => {
    const parsed = validateEnv({
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

  it("should throw a descriptive error on non-numeric PORT", () => {
    expect(() => validateEnv({ PORT: "not-a-number" })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/Invalid environment variables/) })
    );
    expect(() => validateEnv({ PORT: "not-a-number" })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/PORT/) })
    );
  });

  it("should throw on out-of-range PORT", () => {
    expect(() => validateEnv({ PORT: "70000" })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/PORT/) })
    );
    expect(() => validateEnv({ PORT: "0" })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/PORT/) })
    );
  });

  it("should throw on invalid NODE_ENV", () => {
    expect(() => validateEnv({ NODE_ENV: "invalid_env" as any })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/NODE_ENV/) })
    );
  });

  it("should throw on invalid HASURA_GRAPHQL_URL URL format", () => {
    expect(() => validateEnv({ HASURA_GRAPHQL_URL: "not-a-valid-url" })).toThrow(
      expect.objectContaining({ message: expect.stringMatching(/HASURA_GRAPHQL_URL/) })
    );
  });
});
